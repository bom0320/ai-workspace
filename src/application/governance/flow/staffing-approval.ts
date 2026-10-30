import { randomUUID } from "node:crypto";
import { realpathSync } from "node:fs";

import { staffingProposalSchema } from "@/application/staffing/index.js";
import { resolveRepositoryRoot } from "@/infrastructure/git/index.js";
import {
  consumeHumanConfirmation,
  type HumanConfirmation,
} from "@/infrastructure/terminal/index.js";
import {
  assertGovernanceStoreOutsideRepository,
  governanceDigest,
  withGovernanceRecords,
} from "@/services/governance-records/index.js";
import { assertRepositoryMatchesSnapshot } from "@/services/repository-snapshot/index.js";
import { isUnambiguousRepositoryPath } from "@/services/repository-inspection/index.js";

import {
  governanceLedgerSchema,
  humanDelegationPolicyInputSchema,
  humanDelegationPolicySchema,
  staffingSystemPolicySchema,
  type StaffingApprovalResult,
} from "../model/approval.js";
import { evaluateStaffingApproval } from "./validation/evaluate-staffing-approval.js";
import { issueStaffingScope } from "./transformation/issue-staffing-scope.js";

function confirmation(receipt: HumanConfirmation | undefined, binding: string) {
  const evidence = consumeHumanConfirmation(receipt, binding);
  if (
    !evidence ||
    evidence.uid !== process.getuid?.() ||
    Date.now() - Date.parse(evidence.confirmedAt) > 5 * 60_000 ||
    Date.parse(evidence.confirmedAt) > Date.now()
  )
    return undefined;
  return evidence;
}
function repositoryRoot(input: string) {
  const root = realpathSync(resolveRepositoryRoot(input));
  assertGovernanceStoreOutsideRepository(root);
  return root;
}
const denied = (): StaffingApprovalResult => ({
  status: "denied",
  reason:
    "Approval denied: invalid or untrusted records, System Policy violation, stale approval/delegation, duplicate Proposal or Snapshot drift.",
});

export function configureStaffingSystemPolicy(
  input: unknown,
  receipt?: HumanConfirmation
): StaffingApprovalResult {
  try {
    const configuration = staffingSystemPolicySchema.parse(input);
    configuration.repositoryRoot = repositoryRoot(configuration.repositoryRoot);
    if (
      new Set(configuration.availableSpecialists.map(({ id }) => id)).size !==
        configuration.availableSpecialists.length ||
      configuration.availableSpecialists.some(
        ({ authority }) =>
          authority.repositoryAccess !== "read" || authority.shellExecution
      ) ||
      configuration.allowedContextPaths.some(
        (path) => !isUnambiguousRepositoryPath(path)
      )
    )
      return denied();
    return withGovernanceRecords((raw, save) => {
      const ledger = governanceLedgerSchema.parse(raw);
      const key = governanceDigest(configuration.repositoryRoot);
      const entry = ledger.repositories[key] ?? {
        systems: [],
        delegations: [],
        issuances: [],
      };
      const version = (entry.systems.at(-1)?.version ?? 0) + 1;
      const binding = governanceDigest({
        action: "configure-system",
        configuration,
        version,
      });
      const evidence = confirmation(receipt, binding);
      if (receipt && !evidence) return denied();
      if (!evidence)
        return {
          status: "approval-required",
          kind: "system-policy",
          subject: configuration,
          binding,
          reason:
            "Human configuration and approval required for System Policy.",
        };
      entry.systems.push({ configuration, version, approval: evidence });
      ledger.repositories[key] = entry;
      save(governanceLedgerSchema.parse(ledger));
      return { status: "configured", version };
    });
  } catch {
    return denied();
  }
}

export function configureHumanDelegation(
  repositoryPath: string,
  input: unknown,
  receipt?: HumanConfirmation
): StaffingApprovalResult {
  try {
    const root = repositoryRoot(repositoryPath);
    const policy =
      input === null ? null : humanDelegationPolicyInputSchema.parse(input);
    return withGovernanceRecords((raw, save) => {
      const ledger = governanceLedgerSchema.parse(raw);
      const entry = ledger.repositories[governanceDigest(root)];
      const system = entry?.systems.at(-1);
      if (!system) return denied();
      const previous = entry.delegations.at(-1);
      if (!policy && !previous) return denied();
      if (
        policy &&
        (Date.parse(policy.expiresAt) <= Date.now() ||
          new Set(policy.allowedSpecialistIds).size !==
            policy.allowedSpecialistIds.length ||
          policy.allowedSpecialistIds.some(
            (id) =>
              !system.configuration.availableSpecialists.some(
                (specialist) => specialist.id === id
              )
          ) ||
          policy.allowedContextPaths.some(
            (path) =>
              !isUnambiguousRepositoryPath(path) ||
              !system.configuration.allowedContextPaths.includes(path)
          ) ||
          policy.maxAgentInvocations >
            system.configuration.policy.maxAgentInvocations)
      )
        return denied();
      const version = (previous?.version ?? 0) + 1;
      const binding = governanceDigest({
        action: "configure-delegation",
        root,
        policy,
        version,
        systemVersion: system.version,
      });
      const evidence = confirmation(receipt, binding);
      if (receipt && !evidence) return denied();
      if (!evidence)
        return {
          status: "approval-required",
          kind: "delegation",
          subject: policy,
          binding,
          reason: policy
            ? "Human approval required to establish or replace delegation."
            : "Human confirmation required to revoke delegation.",
        };
      if (previous?.status === "active") previous.status = "superseded";
      const next = humanDelegationPolicySchema.parse({
        ...(policy ?? previous),
        id: previous?.id ?? `delegation-${randomUUID()}`,
        version,
        repositoryRoot: root,
        systemPolicyVersion: system.version,
        status: policy ? "active" : "revoked",
        approval: evidence,
      });
      entry.delegations.push(next);
      save(governanceLedgerSchema.parse(ledger));
      return { status: "configured", version };
    });
  } catch {
    return denied();
  }
}

export function approveStaffingProposal(
  input: unknown,
  receipt?: HumanConfirmation
): StaffingApprovalResult {
  try {
    const proposal = staffingProposalSchema.parse(input);
    const root = repositoryRoot(proposal.snapshot.repositoryRoot);
    return withGovernanceRecords((raw, save) => {
      const ledger = governanceLedgerSchema.parse(raw);
      const entry = ledger.repositories[governanceDigest(root)];
      if (!entry) return denied();
      if (
        entry.issuances.some((issuance) => issuance.proposal.id === proposal.id)
      )
        return denied();
      const mode = evaluateStaffingApproval(proposal, entry, Date.now());
      const system = entry.systems.at(-1)!;
      const delegation = entry.delegations.at(-1);
      const binding = governanceDigest({
        action: "approve-staffing",
        proposal,
        systemVersion: system.version,
        delegation: delegation
          ? {
              id: delegation.id,
              version: delegation.version,
              status: delegation.status,
            }
          : null,
      });
      const evidence =
        mode === "direct" ? confirmation(receipt, binding) : undefined;
      if (receipt && mode === "direct" && !evidence) return denied();
      if (mode === "direct" && !evidence)
        return {
          status: "approval-required",
          kind: "staffing",
          subject: proposal,
          binding,
          reason:
            "No active delegation covers this Specialist, Context or invocation budget. Review all original Human Constraints; changes require a new validated Proposal.",
        };
      // Revalidate policy, Snapshot and provenance immediately before issuance.
      if (evaluateStaffingApproval(proposal, entry, Date.now()) !== mode)
        return denied();
      const issuance = issueStaffingScope(
        proposal,
        system.version,
        evidence
          ? { type: "direct-human", confirmation: evidence }
          : {
              type: "human-delegation",
              delegationPolicyId: delegation!.id,
              delegationPolicyVersion: delegation!.version,
              delegationApprovalId: delegation!.approval.id,
            }
      );
      assertRepositoryMatchesSnapshot(proposal.snapshot);
      if (evaluateStaffingApproval(proposal, entry, Date.now()) !== mode)
        return denied();
      if (
        Object.values(ledger.repositories).some((repository) =>
          repository.issuances.some(
            (existing) =>
              existing.scope.id === issuance.scope.id ||
              existing.approval.id === issuance.approval.id
          )
        )
      )
        return denied();
      entry.issuances.push(issuance);
      save(governanceLedgerSchema.parse(ledger));
      return {
        status: "approved",
        approval: issuance.approval,
        scope: issuance.scope,
      };
    });
  } catch {
    return denied();
  }
}

// Reads authenticated issuance and resolves its approval source; still not an
// invocation authorization or budget reservation.
export function getApprovedStaffingScope(
  scopeId: string
): StaffingApprovalResult {
  try {
    return withGovernanceRecords((raw) => {
      const ledger = governanceLedgerSchema.parse(raw);
      for (const entry of Object.values(ledger.repositories)) {
        const issuance = entry.issuances.find(
          ({ scope }) => scope.id === scopeId
        );
        if (!issuance) continue;
        const { approval, scope, proposal } = issuance;
        const system = entry.systems.find(
          ({ version }) => version === approval.systemPolicyVersion
        );
        if (
          !system ||
          entry.systems.at(-1)?.version !== system.version ||
          scope.version !== 1 ||
          scope.proposalId !== proposal.id ||
          approval.proposalId !== proposal.id ||
          scope.approvalRecordId !== approval.id ||
          scope.policyVersion !== `system:${system.version}` ||
          governanceDigest(proposal) !== approval.proposalDigest
        )
          return denied();
        if (
          governanceDigest({
            goal: scope.goal,
            snapshot: scope.snapshot,
            budget: scope.budget,
            assignments: scope.assignments,
          }) !==
          governanceDigest({
            goal: proposal.goal,
            snapshot: proposal.snapshot,
            budget: proposal.budget,
            assignments: proposal.assignments.map(
              ({ assignmentId, specialistId, objective, contextPaths }) => ({
                assignmentId,
                specialistId,
                objective,
                contextPaths,
              })
            ),
          })
        )
          return denied();
        if (approval.source.type === "human-delegation") {
          const source = approval.source;
          const policy = entry.delegations.find(
            ({ id, version }) =>
              id === source.delegationPolicyId &&
              version === source.delegationPolicyVersion
          );
          if (
            !policy ||
            policy !== entry.delegations.at(-1) ||
            policy.status !== "active" ||
            Date.parse(policy.expiresAt) <= Date.now() ||
            policy.approval.id !== source.delegationApprovalId
          )
            return denied();
        }
        const mode = evaluateStaffingApproval(proposal, entry, Date.now());
        if (approval.source.type === "human-delegation" && mode !== "delegated")
          return denied();
        if (
          approval.source.type === "direct-human" &&
          (approval.source.confirmation.uid !== process.getuid?.() ||
            Date.parse(approval.source.confirmation.confirmedAt) >
              Date.parse(approval.approvedAt))
        )
          return denied();
        return { status: "approved", approval, scope };
      }
      return denied();
    });
  } catch {
    return denied();
  }
}
