import { governanceDigest } from "@/services/governance-records/index.js";
import type { RepositoryGovernance } from "../../../../../model/ledger.js";
import type { SynthesisContext } from "@/application/synthesis/index.js";
import type { DirectionReview } from "../../model/review.js";

export const sameContent = (a: unknown, b: unknown) =>
  governanceDigest(a) === governanceDigest(b);
export function assertAnalysisScope(
  context: SynthesisContext,
  scope: RepositoryGovernance["issuances"][number]["scope"]
): void {
  const approved = {
    goal: scope.goal,
    repositoryCommitSha: scope.snapshot.commitSha,
    assignments: scope.assignments.map(
      ({ assignmentId, specialistId, objective }) => ({
        assignmentId,
        specialistId,
        objective,
      })
    ),
  };
  const actual = {
    goal: context.goal,
    repositoryCommitSha: context.repositoryCommitSha,
    assignments: context.assignments,
  };
  if (!sameContent(approved, actual))
    throw new Error("Review Context does not match the approved Scope.");
}

export function reviewBinding(
  review: Omit<DirectionReview, "binding" | "resolution">
) {
  return governanceDigest(review);
}
export function assertReviewRecord(
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

export function validateRevisionRequest({
  scopeId,
  context,
  revision,
  previousReviewId,
  previousReview,
}: {
  scopeId: string;
  context: SynthesisContext;
  revision: SynthesisContext["revision"];
  previousReviewId?: string;
  previousReview?: DirectionReview;
}): number {
  if (previousReviewId) {
    if (
      !previousReview ||
      previousReview.scopeId !== scopeId ||
      previousReview.resolution?.action.action !== "request-revision" ||
      previousReview.revision >= 2 ||
      previousReview.analysisDigest !== governanceDigest(context) ||
      !revision ||
      !sameContent(revision.previousProposal, previousReview.proposal) ||
      revision.feedback !== previousReview.resolution.action.feedback
    )
      throw new Error("Revision does not match Human feedback.");
    return previousReview.revision + 1;
  }
  if (revision) throw new Error("Revision requires a recorded Human request.");
  return 0;
}

export function assertReviewNotRegistered(
  reviews: RepositoryGovernance["directionReviews"],
  scopeId: string,
  previousReviewId?: string
): void {
  if (
    reviews?.some((review) =>
      previousReviewId
        ? review.previousReviewId === previousReviewId
        : review.scopeId === scopeId
    )
  )
    throw new Error("Direction Review has already been registered.");
}
