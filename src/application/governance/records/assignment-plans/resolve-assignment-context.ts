import { governanceDigest } from "@/services/governance-records/index.js";
import { assertRepositoryMatchesSnapshot } from "@/services/repository-snapshot/index.js";
import type { WorkDecompositionResult } from "@/application/work-decomposition/index.js";
import { resolveExecutionHandoff } from "../../approval/features/execution-delegation/flow/verify-execution-handoff.js";
import { executionScopes } from "../../approval/features/system-policy/model/execution-system-policy.js";
import type { GovernanceLedger } from "../../model/ledger.js";
import { withGovernanceLedger } from "../governance-transaction.js";
import { findRegisteredDecomposition } from "../execution-decomposition.js";

export type Handoff = Parameters<typeof resolveExecutionHandoff>[1];
export type Proposal = Extract<WorkDecompositionResult, { status: "proposed" }>;

export function resolvePlanContext(ledger: GovernanceLedger, handoff: Handoff) {
  const {
    entry,
    decision,
    context,
    analysisSources,
    snapshot,
    delegation,
    policy,
  } = resolveExecutionHandoff(ledger, handoff);
  if (Date.parse(delegation.grant.expiresAt) <= Date.now())
    throw new Error(
      "Assignment Plan requires an unexpired Execution Delegation."
    );
  assertRepositoryMatchesSnapshot(snapshot);

  const sources = analysisSources.map(({ scope, assignment }) => {
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
  const scopes = executionScopes(delegation.grant);
  return {
    entry,
    goal: context.goal,
    delegation,
    policy,
    decision,
    snapshot,
    sources,
    staffingBinding: governanceDigest(sources),
    specialistAllowed: scopes.readScopes.length > 0,
    workerAllowed:
      scopes.writeScopes.length > 0 &&
      delegation.grant.workerMode === "codex-worktree" &&
      policy.workerMode === "codex-worktree",
  };
}

export function resolveProposalContext(
  ledger: GovernanceLedger,
  handoff: Handoff,
  proposal: Proposal
) {
  const context = resolvePlanContext(ledger, handoff);
  const decomposition = findRegisteredDecomposition(
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
    return structuredClone({
      workItems: context.decomposition.workItems,
      specialists: context.sources.map(
        ({ definition, assignmentObjective }) => ({
          id: definition.id,
          role: definition.role,
          objective: definition.objective,
          assignmentObjective,
        })
      ),
      specialistAllowed: context.specialistAllowed,
      workerMode: context.workerAllowed
        ? ("codex-worktree" as const)
        : undefined,
    });
  });
}
