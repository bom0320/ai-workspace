import type { PhaseBAssignment } from "@/contracts/assignment/phase-b-assignment.js";
import { isContextScopeContained } from "@/services/repository-inspection/index.js";
import { governanceDigest } from "@/services/governance-records/index.js";
import { assertRepositoryMatchesSnapshot } from "@/services/repository-snapshot/index.js";
import type { WorkDecompositionResult } from "@/application/work-decomposition/index.js";
import { resolveExecutionHandoff } from "../../approval/features/execution-delegation/flow/verify-execution-handoff.js";
import { executionScopes } from "../../approval/features/system-policy/model/execution-system-policy.js";
import type { GovernanceLedger } from "../../model/ledger.js";
import { withGovernanceLedger } from "../governance-transaction.js";
import { findRegisteredWorkDecomposition } from "../work-decomposition-records.js";

export type Handoff = Parameters<typeof resolveExecutionHandoff>[1];
export type Proposal = Extract<WorkDecompositionResult, { status: "proposed" }>;

export function prepareAssignmentContext(
  ledger: GovernanceLedger,
  handoff: Handoff
) {
  const handoffContext = resolveExecutionHandoff(ledger, handoff);
  const { entry, analysisSources, snapshot, delegation, policy } =
    handoffContext;
  if (Date.parse(delegation.grant.expiresAt) <= Date.now())
    throw new Error(
      "Assignment Plan requires an unexpired Execution Delegation."
    );
  assertRepositoryMatchesSnapshot(snapshot);

  const approvedSources = analysisSources.map(({ scope, assignment }) => {
    const issuance = entry.issuances.find(
      (record) =>
        record.scope.id === scope.id && record.scope.version === scope.version
    );
    const definition = entry.systems
      .find(({ version }) => version === issuance?.approval.systemPolicyVersion)
      ?.configuration.availableSpecialists.find(
        ({ id }) => id === assignment.specialistId
      );
    if (
      !issuance ||
      !definition ||
      definition.authority.repositoryAccess !== "read" ||
      definition.authority.shellExecution
    )
      throw new Error("Approved Specialist definition is unavailable.");
    return {
      scopeId: scope.id,
      scopeVersion: scope.version,
      approvalRecordId: issuance.approval.id,
      assignmentId: assignment.assignmentId,
      assignmentObjective: assignment.objective,
      definition,
    };
  });
  // The persisted binding covers the original Phase A policy registration.
  const staffingBinding = governanceDigest(approvedSources);
  const sources = approvedSources.map(
    ({ definition: { id, role, objective }, ...source }) => ({
      ...source,
      definition: { id, role, objective },
    })
  );
  const definitions = new Map<string, string>();
  for (const { definition } of sources) {
    const digest = governanceDigest(definition);
    const prior = definitions.get(definition.id);
    if (prior && prior !== digest)
      throw new Error("Approved Specialist identity is ambiguous.");
    definitions.set(definition.id, digest);
  }
  const granted = executionScopes(delegation.grant);
  const permitted = executionScopes(policy);
  const overlaps = (kind: keyof typeof granted) =>
    granted[kind].some((scope) =>
      isContextScopeContained(scope, { allowedScopes: permitted[kind] })
    ) ||
    permitted[kind].some((scope) =>
      isContextScopeContained(scope, { allowedScopes: granted[kind] })
    );
  const repositoryAccessCeilings: PhaseBAssignment["repositoryAccessCeiling"][] =
    [];
  if (overlaps("readScopes")) repositoryAccessCeilings.push("read");
  if (
    overlaps("writeScopes") &&
    delegation.grant.workerMode === "codex-worktree" &&
    policy.workerMode === "codex-worktree"
  )
    repositoryAccessCeilings.push("write");
  return {
    ...handoffContext,
    sources,
    staffingBinding,
    repositoryAccessCeilings,
  };
}

export function resolveProposalContext(
  ledger: GovernanceLedger,
  handoff: Handoff,
  proposal: Proposal
) {
  const context = prepareAssignmentContext(ledger, handoff);
  const decomposition = findRegisteredWorkDecomposition(
    context.entry,
    proposal,
    governanceDigest(context.decision)
  );
  if (!decomposition || proposal.approvedDecisionId !== context.decision.id)
    throw new Error(
      "Assignment Plan requires the registered Work Decomposition."
    );
  return { ...context, decomposition };
}

// Only the Phase B preparation application uses this context to solicit a proposal.
export function getAssignmentPlanContext(handoff: Handoff, proposal: Proposal) {
  return withGovernanceLedger((ledger) => {
    const context = resolveProposalContext(ledger, handoff, proposal);
    const specialists = new Map(
      context.sources.map(({ definition }) => [
        definition.id,
        {
          id: definition.id,
          role: definition.role,
          objective: definition.objective,
        },
      ])
    );
    return structuredClone({
      workItems: context.decomposition.workItems,
      specialists: [...specialists.values()],
      repositoryAccessCeilings: context.repositoryAccessCeilings,
    });
  });
}
