import { governanceDigest } from "@/services/governance-records/index.js";
import type { SynthesisContext } from "@/application/synthesis/index.js";
import type { InvokeSpecialistRequest } from "../../../../../model/authority.js";
import type { RepositoryGovernance } from "../../../../../model/ledger.js";
import {
  validateStoredIssuance,
  validateStoredIssuanceRecord,
} from "../../../../../approval/features/proposal-management/flow/validation/staffing-issuance.js";
import {
  MAX_ANALYSIS_REFINEMENTS,
  type AnalysisRefinement,
} from "../../model/analysis-refinement.js";

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

export function assertRefinementAvailable(
  entry: RepositoryGovernance,
  rootScopeId: string,
  changeDigest: string,
  calls: number
) {
  const root = requireAnalysisRoot(entry, rootScopeId);
  validateStoredIssuance(root, entry);
  const rounds = (entry.analysisRefinements ?? []).filter(
    (value) => value.rootScopeId === rootScopeId
  );
  if (
    rounds.length >= MAX_ANALYSIS_REFINEMENTS ||
    rounds.some((value) => value.changeDigest === changeDigest) ||
    calls > remainingAnalysisBudget(entry, rootScopeId)
  )
    throw new Error("Refinement repeated or analysis limits exhausted.");
  return root;
}

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

export function verifyAnalysisSources(
  entry: RepositoryGovernance,
  rootScopeId: string,
  context: Omit<SynthesisContext, "revision">,
  invocationIds: string[],
  current: boolean
) {
  const validate = current
    ? validateStoredIssuance
    : validateStoredIssuanceRecord;
  const root = requireAnalysisRoot(entry, rootScopeId);
  if (
    invocationIds.length !== context.decisions.length ||
    invocationIds.length !== context.assignments.length ||
    new Set(invocationIds).size !== invocationIds.length ||
    context.repositoryCommitSha !== root.scope.snapshot.commitSha ||
    governanceDigest(context.goal) !== governanceDigest(root.scope.goal)
  )
    throw new Error("Analysis basis does not match the original Scope.");
  const validated = new Set([rootScopeId]);
  validate(root, entry);
  return invocationIds.map((id, index) => {
    const reservations = entry.reservations?.filter(
      ({ invocationId }) => invocationId === id
    );
    const reservation = reservations?.[0];
    const issuances = entry.issuances.filter(
      ({ scope }) => scope.id === reservation?.scopeId
    );
    const issuance = issuances[0];
    const assignment = issuance?.scope.assignments.find(
      ({ assignmentId }) => assignmentId === reservation?.assignmentId
    );
    const { decision, projection } = {
      decision: context.decisions[index],
      projection: context.assignments[index],
    };
    if (
      reservations?.length !== 1 ||
      issuances.length !== 1 ||
      !assignment ||
      !reservation?.claimedAt ||
      reservation.scopeVersion !== issuance.scope.version ||
      (issuance.scope.id !== rootScopeId &&
        issuance.proposal.refinement?.rootScopeId !== rootScopeId) ||
      governanceDigest(issuance.scope.snapshot) !==
        governanceDigest(root.scope.snapshot) ||
      governanceDigest(issuance.scope.goal) !==
        governanceDigest(root.scope.goal) ||
      reservation.decisionDigest !== governanceDigest(decision) ||
      assignment.specialistId !== decision.specialistId ||
      assignment.specialistId !== projection.specialistId ||
      assignment.assignmentId !== projection.assignmentId ||
      assignment.objective !== projection.objective
    )
      throw new Error(
        "Analysis does not match a successful claimed Assignment."
      );
    if (!validated.has(issuance.scope.id)) {
      validate(issuance, entry);
      validated.add(issuance.scope.id);
    }
    if (reservation.analysisRefinementId) {
      const round = entry.analysisRefinements?.find(
        ({ id }) => id === reservation.analysisRefinementId
      );
      if (
        !round?.requests.every((request) =>
          entry.reservations?.some(
            (record) =>
              record.analysisRefinementId === round.id &&
              record.claimedAt &&
              record.decisionDigest &&
              record.requestDigest === governanceDigest(request)
          )
        )
      )
        throw new Error("Analysis came from an incomplete refinement batch.");
    }
    return { scope: issuance.scope, assignment };
  });
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
    for (const { proposal, scope } of entry.issuances) {
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
          MAX_ANALYSIS_REFINEMENTS &&
        remainingAnalysisBudget(entry, rootScopeId) >= 0
    );
  } catch {
    return false;
  }
}
