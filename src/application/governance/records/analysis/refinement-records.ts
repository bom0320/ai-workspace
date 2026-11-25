import { governanceDigest } from "@/services/governance-records/index.js";
import type { ApprovedOperatingScope } from "../../model/authority.js";
import type { InvokeSpecialistRequest } from "../../data-flow/specialist-invocation/input.js";
import type { RepositoryGovernance } from "../../model/ledger.js";
import type { AnalysisRefinement } from "../../model/analysis-refinement.js";
import {
  requireAnalysisRoot,
  remainingAnalysisBudget,
  approvedAnalysisLimits,
  hasBoundAnalysisLimits,
} from "./analysis-budget.js";

export function requireRefinementRequest(
  entry: RepositoryGovernance,
  rootScopeId: string,
  id: string,
  request: InvokeSpecialistRequest
): AnalysisRefinement {
  const matches = entry.analysisRefinements?.filter(
    (round) => round.id === id && round.rootScopeId === rootScopeId
  );
  if (
    matches?.length !== 1 ||
    !matches[0].requests.some(
      (value) => governanceDigest(value) === governanceDigest(request)
    )
  )
    throw new Error("Refinement request is not bound to an approved round.");
  return matches[0];
}

export function hasValidAnalysisRefinements(
  entry: RepositoryGovernance
): boolean {
  try {
    const rounds = entry.analysisRefinements ?? [];
    const ids = new Set<string>();
    const changes = new Set<string>();
    const roots = new Set<string>();
    for (const round of rounds) {
      if (ids.has(round.id)) return false;
      ids.add(round.id);
      roots.add(round.rootScopeId);
      const root = requireAnalysisRoot(entry, round.rootScopeId);
      const change = governanceDigest([round.rootScopeId, round.changeDigest]);
      if (changes.has(change)) return false;
      changes.add(change);
      const requests = round.requests;
      const scopeId = requests[0].scopeId;
      const issuances = entry.issuances.filter(
        ({ scope }) => scope.id === scopeId
      );
      const target = issuances[0];
      if (
        issuances.length !== 1 ||
        (target !== root &&
          target.proposal.refinement?.rootScopeId !== round.rootScopeId) ||
        new Set(requests.map(({ assignmentId }) => assignmentId)).size !==
          requests.length ||
        requests.some((request) => {
          const assignment = target.scope.assignments.find(
            ({ assignmentId }) => assignmentId === request.assignmentId
          );
          return (
            request.scopeId !== scopeId ||
            request.scopeVersion !== target.scope.version ||
            !assignment ||
            request.requestedContextPaths.some(
              (path) => !assignment.contextPaths.includes(path)
            )
          );
        })
      )
        return false;
    }
    for (const issuance of entry.issuances) {
      if (!hasBoundAnalysisLimits(issuance, entry)) return false;
      const { proposal, scope } = issuance;
      const linkage = proposal.refinement;
      if (
        linkage &&
        !rounds.some(
          ({ requests, ...binding }) =>
            governanceDigest(binding) === governanceDigest(linkage) &&
            requests.length === scope.assignments.length &&
            requests.every((request) => request.scopeId === scope.id)
        )
      )
        return false;
    }
    const reserved = new Set<string>();
    for (const record of entry.reservations ?? []) {
      if (record.decisionDigest && !record.claimedAt) return false;
      const scope = entry.issuances.find(
        ({ scope }) => scope.id === record.scopeId
      );
      if (scope?.proposal.refinement && !record.analysisRefinementId)
        return false;
      if (!record.analysisRefinementId) continue;
      const round = rounds.find(({ id }) => id === record.analysisRefinementId);
      const key = governanceDigest([
        record.analysisRefinementId,
        record.requestDigest,
      ]);
      if (
        reserved.has(key) ||
        !round?.requests.some(
          (request) =>
            request.scopeId === record.scopeId &&
            request.scopeVersion === record.scopeVersion &&
            request.assignmentId === record.assignmentId &&
            governanceDigest(request) === record.requestDigest
        )
      )
        return false;
      reserved.add(key);
    }
    return [...roots].every(
      (rootScopeId) =>
        rounds.filter((round) => round.rootScopeId === rootScopeId).length <=
          approvedAnalysisLimits(requireAnalysisRoot(entry, rootScopeId).scope)
            .maxRefinementRounds &&
        remainingAnalysisBudget(entry, rootScopeId) >= 0
    );
  } catch {
    return false;
  }
}

export function projectRefinementRequests(scope: ApprovedOperatingScope) {
  return scope.assignments.map(({ assignmentId, contextPaths }) => ({
    scopeId: scope.id,
    scopeVersion: scope.version,
    assignmentId,
    requestedContextPaths: contextPaths,
  }));
}
