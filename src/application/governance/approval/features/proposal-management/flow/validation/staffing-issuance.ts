import { governanceDigest } from "@/services/governance-records/index.js";
import type {
  GovernanceLedger,
  RepositoryGovernance,
} from "../../../../shared/model/ledger.js";
import {
  evaluateStaffingApproval,
  validateCurrentStaffingPolicy,
} from "./evaluate-staffing-approval.js";

type StaffingIssuance = RepositoryGovernance["issuances"][number];

export function assertProposalNotIssued(
  entry: RepositoryGovernance,
  proposalId: string
): void {
  if (entry.issuances.some(({ proposal }) => proposal.id === proposalId))
    throw new Error("Proposal has already been issued.");
}

export function assertIssuanceIdsUnused(
  ledger: GovernanceLedger,
  issuance: StaffingIssuance
): void {
  if (
    Object.values(ledger.repositories).some((repository) =>
      repository.issuances.some(
        (existing) =>
          existing.scope.id === issuance.scope.id ||
          existing.approval.id === issuance.approval.id
      )
    )
  )
    throw new Error("Approval or Scope ID collision.");
}

function assertApprovalBinding(
  { proposal, approval, scope }: StaffingIssuance,
  entry: RepositoryGovernance
): void {
  const system = entry.systems.find(
    ({ version }) => version === approval.systemPolicyVersion
  );
  if (!system || entry.systems.at(-1)?.version !== system.version)
    throw new Error("Issuance is not bound to the current System Policy.");
  if (
    scope.version !== 1 ||
    scope.proposalId !== proposal.id ||
    approval.proposalId !== proposal.id ||
    scope.approvalRecordId !== approval.id ||
    scope.policyVersion !== `system:${system.version}` ||
    governanceDigest(proposal) !== approval.proposalDigest
  )
    throw new Error(
      "Proposal, ApprovalRecord and Scope bindings do not match."
    );
}

function assertScopeContents({ proposal, scope }: StaffingIssuance): void {
  const scoped = {
    goal: scope.goal,
    snapshot: scope.snapshot,
    budget: scope.budget,
    assignments: scope.assignments,
  };
  const proposed = {
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
  };
  if (governanceDigest(scoped) !== governanceDigest(proposed))
    throw new Error("Scope contents differ from the approved Proposal.");
}

function assertDelegatedApprovalSource(
  issuance: StaffingIssuance,
  entry: RepositoryGovernance
): void {
  const source = issuance.approval.source;
  if (source.type !== "human-delegation") return;
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
    throw new Error("Delegated approval source is no longer valid.");
}

export function validateStoredIssuance(
  issuance: StaffingIssuance,
  entry: RepositoryGovernance
): void {
  assertApprovalBinding(issuance, entry);
  assertScopeContents(issuance);
  assertDelegatedApprovalSource(issuance, entry);
  const { approval } = issuance;
  // A direct approval is bound to its own Human receipt, not an unrelated
  // delegation's lifecycle. Both sources still require current System Policy.
  if (approval.source.type === "direct-human")
    validateCurrentStaffingPolicy(issuance.proposal, entry);
  if (
    approval.source.type === "human-delegation" &&
    evaluateStaffingApproval(issuance.proposal, entry, Date.now()) !==
      "delegated"
  )
    throw new Error("Current evaluation no longer permits delegated approval.");
  if (
    approval.source.type === "direct-human" &&
    (approval.source.confirmation.uid !== process.getuid?.() ||
      Date.parse(approval.source.confirmation.confirmedAt) >
        Date.parse(approval.approvedAt))
  )
    throw new Error("Direct Human confirmation does not match the issuance.");
}
