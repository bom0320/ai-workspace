import { governanceDigest } from "@/services/governance-records/index.js";
import type { SynthesisContext } from "@/application/synthesis/index.js";
import type {
  AssessmentInput,
  AssessmentLimits,
} from "@/application/analysis/index.js";
import type { RepositoryGovernance } from "../../model/ledger.js";
import {
  validateStoredIssuance,
  validateStoredIssuanceRecord,
} from "../../approval/features/proposal-management/flow/validation/staffing-issuance.js";
import { MAX_ANALYSIS_REFINEMENTS } from "../../model/analysis-refinement.js";
import { withGovernanceLedger } from "../governance-transaction.js";
import {
  requireAnalysisRoot,
  remainingAnalysisBudget,
} from "./analysis-budget.js";

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

export function assertCurrentAnalysis(
  rootScopeId: string,
  basis: AssessmentInput,
  invocationIds: string[]
): AssessmentLimits {
  return withGovernanceLedger((ledger) => {
    const entries = Object.values(ledger.repositories).filter((entry) =>
      entry.issuances.some(({ scope }) => scope.id === rootScopeId)
    );
    if (entries.length !== 1)
      throw new Error("Initial analysis Scope unavailable.");
    verifyAnalysisSources(entries[0], rootScopeId, basis, invocationIds, true);
    return {
      remainingInvocations: remainingAnalysisBudget(entries[0], rootScopeId),
      remainingRefinements:
        MAX_ANALYSIS_REFINEMENTS -
        (entries[0].analysisRefinements ?? []).filter(
          (round) => round.rootScopeId === rootScopeId
        ).length,
    };
  });
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
