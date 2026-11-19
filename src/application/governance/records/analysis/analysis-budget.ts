import type { RepositoryGovernance } from "../../model/ledger.js";
import type { ApprovedOperatingScope } from "../../model/authority.js";
import { governanceDigest } from "@/services/governance-records/index.js";

const LEGACY_MAX_REFINEMENT_ROUNDS = 2;

export function approvedAnalysisLimits(scope: ApprovedOperatingScope) {
  return {
    maxTotalAnalysisInvocations:
      scope.budget.maxTotalAnalysisInvocations ??
      scope.budget.maxAgentInvocations,
    maxRefinementRounds:
      scope.analysis?.maxRefinementRounds ?? LEGACY_MAX_REFINEMENT_ROUNDS,
  };
}

// Bind new analysis limits to the original Proposal and policy version. Existing
// records omit these fields and retain their previous authorization.
export function hasBoundAnalysisLimits(
  { proposal, scope, approval }: RepositoryGovernance["issuances"][number],
  entry: RepositoryGovernance
): boolean {
  const requestedTotal = proposal.budget.maxTotalAnalysisInvocations;
  const policy = entry.systems.find(
    ({ version }) => version === approval.systemPolicyVersion
  )?.configuration.analysis;
  if (proposal.refinement)
    return (
      requestedTotal === undefined &&
      scope.budget.maxTotalAnalysisInvocations === undefined &&
      scope.analysis === undefined
    );

  const initial = proposal.budget.maxAgentInvocations;
  const total = requestedTotal ?? initial;
  if (
    (scope.analysis || policy || requestedTotal !== undefined) &&
    (scope.budget.maxAgentInvocations !== initial ||
      governanceDigest(proposal) !== approval.proposalDigest)
  )
    return false;
  return (
    scope.analysis?.maxRefinementRounds === policy?.maxRefinementRounds &&
    scope.budget.maxTotalAnalysisInvocations === requestedTotal &&
    total >= initial &&
    total <= (policy?.maxTotalAnalysisInvocations ?? initial)
  );
}

export function requireAnalysisRoot(
  entry: RepositoryGovernance,
  rootScopeId: string
) {
  const matches = entry.issuances.filter(
    ({ scope }) => scope.id === rootScopeId
  );
  if (matches.length !== 1 || matches[0].proposal.refinement)
    throw new Error("Initial analysis Scope unavailable.");
  return matches[0];
}

export function remainingAnalysisBudget(
  entry: RepositoryGovernance,
  rootScopeId: string
): number {
  const { scope } = requireAnalysisRoot(entry, rootScopeId);
  const children = new Set(
    entry.issuances
      .filter(
        ({ proposal }) => proposal.refinement?.rootScopeId === rootScopeId
      )
      .map(({ scope }) => scope.id)
  );
  return (
    approvedAnalysisLimits(scope).maxTotalAnalysisInvocations -
    (entry.reservations ?? []).filter(
      (reservation) =>
        reservation.scopeId === rootScopeId || children.has(reservation.scopeId)
    ).length
  );
}
