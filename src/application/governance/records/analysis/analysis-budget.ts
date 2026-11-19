import type { RepositoryGovernance } from "../../model/ledger.js";

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
    scope.budget.maxAgentInvocations -
    (entry.reservations ?? []).filter(
      (reservation) =>
        reservation.scopeId === rootScopeId || children.has(reservation.scopeId)
    ).length
  );
}
