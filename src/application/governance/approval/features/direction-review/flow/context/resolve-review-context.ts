import type {
  GovernanceLedger,
  RepositoryGovernance,
} from "../../../../../model/ledger.js";
import type { SynthesisContext } from "@/application/synthesis/index.js";
import type { DirectionReview } from "../../model/review.js";
import {
  validateStoredIssuance,
  validateStoredIssuanceRecord,
} from "../../../proposal-management/flow/validation/staffing-issuance.js";
import {
  DirectionReviewValidationError,
  assertAnalysisScope,
  assertReviewRecord,
} from "../validation/validate-review-record.js";

function scopeSource(ledger: GovernanceLedger, scopeId: string) {
  const matches = Object.values(ledger.repositories).flatMap((entry) =>
    entry.issuances
      .filter((issuance) => issuance.scope.id === scopeId)
      .map((issuance) => ({ entry, issuance }))
  );
  if (matches.length !== 1)
    throw new DirectionReviewValidationError(
      "Direction source Scope is unavailable or ambiguous."
    );
  return matches[0];
}
function legacyAnalysisContext(
  entry: RepositoryGovernance,
  scope: RepositoryGovernance["issuances"][number]["scope"]
): SynthesisContext {
  const analysis = entry.directionAnalyses?.find(
    (value) =>
      value.scopeId === scope.id && value.scopeVersion === scope.version
  );
  if (!analysis || analysis.decisions.length !== scope.assignments.length)
    throw new DirectionReviewValidationError(
      "Validated analysis provenance is incomplete."
    );
  const decisions = scope.assignments.map((assignment) => {
    const matches = analysis.decisions.filter(
      (value) => value.assignmentId === assignment.assignmentId
    );
    const result = matches[0];
    const reservation = entry.reservations?.find(
      (value) => value.invocationId === result?.invocationId
    );
    if (
      matches.length !== 1 ||
      !reservation?.claimedAt ||
      reservation.scopeId !== scope.id ||
      reservation.scopeVersion !== scope.version ||
      reservation.assignmentId !== assignment.assignmentId ||
      result.decision.specialistId !== assignment.specialistId
    )
      throw new DirectionReviewValidationError(
        "Analysis does not match claimed approved Assignments."
      );
    return result.decision;
  });
  const comparison =
    decisions.length === 1
      ? {
          status: "skipped" as const,
          reason: "insufficient-decisions" as const,
        }
      : analysis.comparison;
  if (
    !comparison ||
    (decisions.length > 1 && comparison.status !== "completed")
  )
    throw new DirectionReviewValidationError(
      "Validated Comparison provenance is unavailable."
    );
  return {
    goal: scope.goal,
    repositoryCommitSha: scope.snapshot.commitSha,
    assignments: scope.assignments.map(
      ({ assignmentId, specialistId, objective }) => ({
        assignmentId,
        specialistId,
        objective,
      })
    ),
    decisions,
    comparison,
  };
}

// New records keep one Context at the initial Review. Old signed records still
// resolve through directionAnalyses; reads never migrate or discard their history.
function reviewContext(
  entry: RepositoryGovernance,
  scope: RepositoryGovernance["issuances"][number]["scope"],
  review: DirectionReview
): SynthesisContext {
  if (review.context) return review.context;
  if (review.previousReviewId) {
    const parent = entry.directionReviews?.find(
      (value) => value.id === review.previousReviewId
    );
    if (
      !parent ||
      parent.revision + 1 !== review.revision ||
      parent.scopeId !== scope.id ||
      parent.scopeVersion !== scope.version
    )
      throw new DirectionReviewValidationError(
        "Revision Context source is invalid."
      );
    return reviewContext(entry, scope, parent);
  }
  return legacyAnalysisContext(entry, scope);
}

function resolveReview(
  ledger: GovernanceLedger,
  reviewId: string,
  validateIssuance: typeof validateStoredIssuanceRecord
) {
  const matches = Object.values(ledger.repositories).flatMap((entry) =>
    (entry.directionReviews ?? [])
      .filter((review) => review.id === reviewId)
      .map((review) => ({ entry, review }))
  );
  if (matches.length !== 1)
    throw new DirectionReviewValidationError(
      "Direction Review is unavailable or ambiguous."
    );
  const { review, entry: reviewEntry } = matches[0];
  const { entry, issuance } = scopeSource(ledger, review.scopeId);
  const { scope } = issuance;
  if (entry !== reviewEntry)
    throw new DirectionReviewValidationError(
      "Review and Scope belong to different Repository records."
    );
  validateIssuance(issuance, entry);
  const context = reviewContext(entry, scope, review);
  assertAnalysisScope(context, scope);
  assertReviewRecord(review, entry, scope, context);
  return { entry, review, context, snapshot: scope.snapshot };
}

// History checks have no live Repository I/O. Mutating and pending-review paths
// additionally enforce the existing current Staffing eligibility policy.
export function currentScopeSource(ledger: GovernanceLedger, scopeId: string) {
  const source = scopeSource(ledger, scopeId);
  validateStoredIssuance(source.issuance, source.entry);
  return source;
}
export function resolveReviewRecord(
  ledger: GovernanceLedger,
  reviewId: string
) {
  return resolveReview(ledger, reviewId, validateStoredIssuanceRecord);
}
export function resolveCurrentReview(
  ledger: GovernanceLedger,
  reviewId: string
) {
  return resolveReview(ledger, reviewId, validateStoredIssuance);
}
