import { governanceDigest } from "@/services/governance-records/index.js";
import type {
  GovernanceLedger,
  RepositoryGovernance,
} from "../../../../model/ledger.js";
import type { SynthesisContext } from "@/application/synthesis/index.js";
import type { DirectionReview } from "../model.js";
import {
  validateStoredIssuance,
  validateStoredIssuanceRecord,
} from "../../proposal-management/flow/validation/staffing-issuance.js";

export const sameContent = (a: unknown, b: unknown) =>
  governanceDigest(a) === governanceDigest(b);
export function scopeSource(ledger: GovernanceLedger, scopeId: string) {
  const matches = Object.values(ledger.repositories).flatMap((entry) =>
    entry.issuances
      .filter((issuance) => issuance.scope.id === scopeId)
      .map((issuance) => ({ entry, issuance }))
  );
  if (matches.length !== 1)
    throw new Error("Direction source Scope is unavailable or ambiguous.");
  return matches[0];
}
export function analysisContext(
  entry: RepositoryGovernance,
  scope: RepositoryGovernance["issuances"][number]["scope"]
): SynthesisContext {
  const analysis = entry.directionAnalyses?.find(
    (value) =>
      value.scopeId === scope.id && value.scopeVersion === scope.version
  );
  if (!analysis || analysis.decisions.length !== scope.assignments.length)
    throw new Error("Validated analysis provenance is incomplete.");
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
      throw new Error("Analysis does not match claimed approved Assignments.");
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
    throw new Error("Validated Comparison provenance is unavailable.");
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

export function reviewBinding(
  review: Omit<DirectionReview, "binding" | "resolution">
) {
  return governanceDigest(review);
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
    throw new Error("Direction Review is unavailable or ambiguous.");
  const { review, entry: reviewEntry } = matches[0];
  const { entry, issuance } = scopeSource(ledger, review.scopeId);
  const { scope } = issuance;
  if (entry !== reviewEntry)
    throw new Error("Review and Scope belong to different Repository records.");
  validateIssuance(issuance, entry);
  const context = analysisContext(entry, scope);
  assertReviewRecord(review, entry, scope, context);
  return { entry, review, context, snapshot: scope.snapshot };
}

function assertReviewRecord(
  review: DirectionReview,
  entry: RepositoryGovernance,
  scope: RepositoryGovernance["issuances"][number]["scope"],
  context: SynthesisContext
): void {
  const { binding, resolution, ...subject } = review;
  if (
    scope.version !== review.scopeVersion ||
    governanceDigest(context) !== review.analysisDigest ||
    binding !== reviewBinding(subject)
  )
    throw new Error("Direction Review binding is invalid.");
  if (review.revision > 0) {
    const parent = entry.directionReviews?.find(
      (value) => value.id === review.previousReviewId
    );
    if (
      !parent ||
      parent.resolution?.action.action !== "request-revision" ||
      parent.revision + 1 !== review.revision ||
      parent.analysisDigest !== review.analysisDigest ||
      parent.scopeId !== review.scopeId ||
      parent.scopeVersion !== review.scopeVersion
    )
      throw new Error("Revision provenance is invalid.");
    // Revision numbers strictly decrease, so the maximum two ancestors are bounded.
    assertReviewRecord(parent, entry, scope, context);
  } else if (review.previousReviewId)
    throw new Error("Unexpected previous Review.");
  if (resolution) {
    const expected = governanceDigest({
      reviewBinding: binding,
      action: resolution.action,
    });
    if (
      resolution.action.reviewId !== review.id ||
      resolution.action.binding !== binding ||
      resolution.confirmationBinding !== expected ||
      resolution.confirmation.uid !== process.getuid?.() ||
      Date.parse(resolution.confirmation.confirmedAt) >
        Date.parse(resolution.resolvedAt)
    )
      throw new Error("Direction resolution provenance is invalid.");
  }
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
