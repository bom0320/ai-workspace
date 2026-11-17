import { randomUUID } from "node:crypto";
import {
  consumeValidatedDecision,
  type AgentDecision,
} from "@/application/decision/index.js";
import {
  consumeValidatedComparison,
  type ComparisonResult,
} from "@/application/comparison/index.js";
import {
  consumeValidatedSynthesis,
  type SynthesisContext,
  type SynthesisResult,
} from "@/application/synthesis/index.js";
import type { HumanConfirmation } from "@/infrastructure/terminal/index.js";
import { governanceDigest } from "@/services/governance-records/index.js";
import type { AuthorizedSpecialistInvocation } from "../../../model/authority.js";
import type {
  GovernanceLedger,
  RepositoryGovernance,
} from "../../../model/ledger.js";
import { withGovernanceLedger } from "../../../records/governance-transaction.js";
import { validateStoredIssuance } from "../proposal-management/flow/validation/staffing-issuance.js";
import { consumeCurrentHumanConfirmation } from "../../shared/validation/approval-input.js";
import {
  directionActionSchema,
  type DirectionReview,
  type DirectionAction,
  type DirectionConfirmationRequest,
  type DirectionGovernanceResult,
} from "./model.js";

const equal = (a: unknown, b: unknown) =>
  governanceDigest(a) === governanceDigest(b);
function scopeSource(ledger: GovernanceLedger, scopeId: string) {
  const matches = Object.values(ledger.repositories).flatMap((entry) =>
    entry.issuances
      .filter((issuance) => issuance.scope.id === scopeId)
      .map((issuance) => ({ entry, issuance }))
  );
  if (matches.length !== 1)
    throw new Error("Direction source Scope is unavailable or ambiguous.");
  const source = matches[0];
  validateStoredIssuance(source.issuance, source.entry);
  return source;
}
function analysisContext(
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

// Called before a validated object crosses a Graph serialization boundary.
// Neither a stored Claim nor a structurally valid AgentDecision alone proves execution.
export function recordDirectionDecision(
  invocation: AuthorizedSpecialistInvocation,
  decision: AgentDecision
): void {
  const proof = consumeValidatedDecision(decision);
  withGovernanceLedger((ledger, save) => {
    const {
      entry,
      issuance: { scope },
    } = scopeSource(ledger, invocation.scopeId);
    const reservation = entry.reservations?.find(
      (value) => value.invocationId === invocation.invocationId
    );
    if (
      !reservation?.claimedAt ||
      reservation.invocationDigest !== governanceDigest(invocation) ||
      !equal(proof.snapshot, invocation.snapshot) ||
      !equal(proof.context, {
        goal: invocation.goal,
        assignmentObjective: invocation.assignmentObjective,
        repositoryCommitSha: invocation.snapshot.commitSha,
        files: invocation.files,
      }) ||
      proof.decision.specialistId !== invocation.specialist.id ||
      scope.version !== invocation.scopeVersion
    )
      throw new Error(
        "Decision provenance does not match the claimed Invocation."
      );
    const analyses = (entry.directionAnalyses ??= []);
    let analysis = analyses.find(
      (value) =>
        value.scopeId === scope.id && value.scopeVersion === scope.version
    );
    if (!analysis) {
      analysis = {
        scopeId: scope.id,
        scopeVersion: scope.version,
        decisions: [],
      };
      analyses.push(analysis);
    }
    if (
      analysis.decisions.some(
        (value) =>
          value.assignmentId === invocation.assignmentId ||
          value.invocationId === invocation.invocationId
      )
    )
      throw new Error("Direction Assignment has already been recorded.");
    analysis.decisions.push({
      invocationId: invocation.invocationId,
      assignmentId: invocation.assignmentId,
      decision: proof.decision,
    });
    save();
  });
}

export function recordDirectionComparison(
  scopeId: string,
  comparison: ComparisonResult
): void {
  const proof = consumeValidatedComparison(comparison);
  withGovernanceLedger((ledger, save) => {
    const {
      entry,
      issuance: { scope },
    } = scopeSource(ledger, scopeId);
    const analysis = entry.directionAnalyses?.find(
      (value) => value.scopeId === scopeId
    );
    if (
      !analysis ||
      analysis.comparison ||
      analysis.decisions.length !== scope.assignments.length
    )
      throw new Error(
        "Comparison source analysis is incomplete or already recorded."
      );
    const decisions = scope.assignments.map(
      (assignment) =>
        analysis.decisions.find(
          (value) => value.assignmentId === assignment.assignmentId
        )?.decision
    );
    if (
      !equal(proof.context, {
        goal: scope.goal,
        repositoryCommitSha: scope.snapshot.commitSha,
        decisions,
      })
    )
      throw new Error(
        "Comparison provenance does not match approved analysis."
      );
    analysis.comparison = { status: "completed", comparison: proof.comparison };
    save();
  });
}

function reviewBinding(
  review: Omit<DirectionReview, "binding" | "resolution">
) {
  return governanceDigest(review);
}
function trustedReview(ledger: GovernanceLedger, reviewId: string) {
  const matches = Object.values(ledger.repositories).flatMap((entry) =>
    (entry.directionReviews ?? []).filter((review) => review.id === reviewId)
  );
  if (matches.length !== 1)
    throw new Error("Direction Review is unavailable or ambiguous.");
  const review = matches[0];
  const {
    entry,
    issuance: { scope },
  } = scopeSource(ledger, review.scopeId);
  const context = analysisContext(entry, scope);
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
      parent.analysisDigest !== review.analysisDigest
    )
      throw new Error("Revision provenance is invalid.");
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
  return { entry, review, context, snapshot: scope.snapshot };
}

export function registerDirectionReview(
  scopeId: string,
  result: Extract<SynthesisResult, { status: "proposed" }>,
  previousReviewId?: string
): DirectionReview {
  const proof = consumeValidatedSynthesis(result);
  return withGovernanceLedger((ledger, save) => {
    const {
      entry,
      issuance: { scope },
    } = scopeSource(ledger, scopeId);
    const context = analysisContext(entry, scope);
    const { revision, ...original } = proof.context;
    if (!equal(original, context))
      throw new Error("Synthesis has no matching trusted analysis provenance.");
    let count = 0;
    if (previousReviewId) {
      const parent = trustedReview(ledger, previousReviewId).review;
      if (
        parent.scopeId !== scopeId ||
        parent.resolution?.action.action !== "request-revision" ||
        parent.revision >= 2 ||
        !revision ||
        !equal(revision.previousProposal, parent.proposal) ||
        revision.feedback !== parent.resolution.action.feedback
      )
        throw new Error("Revision does not match Human feedback.");
      count = parent.revision + 1;
    } else if (revision)
      throw new Error("Revision requires a recorded Human request.");
    if (
      entry.directionReviews?.some((value) =>
        previousReviewId
          ? value.previousReviewId === previousReviewId
          : value.scopeId === scopeId
      )
    )
      throw new Error("Direction Review has already been registered.");
    const subject = {
      id: randomUUID(),
      scopeId,
      scopeVersion: scope.version,
      analysisDigest: governanceDigest(context),
      proposal: proof.proposal,
      revision: count,
      ...(previousReviewId ? { previousReviewId } : {}),
    };
    const review = { ...subject, binding: reviewBinding(subject) };
    (entry.directionReviews ??= []).push(review);
    save();
    return structuredClone(review);
  });
}

export function getDirectionReview(reviewId: string) {
  return withGovernanceLedger((ledger) => {
    const { review, context, snapshot } = trustedReview(ledger, reviewId);
    return structuredClone({ review, context, snapshot });
  });
}

export function prepareDirectionConfirmation(
  input: unknown
): DirectionConfirmationRequest {
  const action = directionActionSchema.parse(input);
  return withGovernanceLedger((ledger) => {
    const { review, context, snapshot } = trustedReview(
      ledger,
      action.reviewId
    );
    if (
      review.binding !== action.binding ||
      review.resolution ||
      (action.action === "request-revision" && review.revision >= 2)
    )
      throw new Error(
        "Review is stale, resolved, mismatched or at its revision limit."
      );
    return structuredClone({
      action,
      review,
      context,
      snapshot,
      binding: governanceDigest({ reviewBinding: review.binding, action }),
    });
  });
}

export function finalizeDirectionReview(
  input: unknown,
  receipt?: HumanConfirmation
): DirectionGovernanceResult {
  try {
    const action: DirectionAction = directionActionSchema.parse(input);
    return withGovernanceLedger((ledger, save): DirectionGovernanceResult => {
      const { entry, review } = trustedReview(ledger, action.reviewId);
      if (
        review.binding !== action.binding ||
        review.resolution ||
        (action.action === "request-revision" && review.revision >= 2)
      )
        throw new Error(
          "Review is stale, resolved, mismatched or at its revision limit."
        );
      const binding = governanceDigest({
        reviewBinding: review.binding,
        action,
      });
      const confirmation = consumeCurrentHumanConfirmation(receipt, binding);
      if (!confirmation) {
        if (receipt)
          throw new Error("Human Confirmation is invalid or already consumed.");
        return { status: "confirmation-required", reviewId: review.id };
      }
      review.resolution = {
        id: randomUUID(),
        action,
        confirmationBinding: binding,
        confirmation,
        resolvedAt: new Date().toISOString(),
      };
      if (action.action === "approve") {
        const decision = {
          id: randomUUID(),
          reviewId: review.id,
          reviewBinding: review.binding,
          approvalRecordId: review.resolution.id,
        };
        (entry.approvedDecisions ??= []).push(decision);
        save();
        return { status: "approved", decision };
      }
      save();
      return action.action === "reject"
        ? { status: "rejected", reviewId: review.id }
        : {
            status: "revision-requested",
            reviewId: review.id,
            feedback: action.feedback,
          };
    });
  } catch {
    return {
      status: "denied",
      reason: "Direction Review or Human Confirmation could not be verified.",
    };
  }
}

// Resolves direction, original Goal/Snapshot and the actual Human record without
// duplicating the Proposal in ApprovedDecision. This grants no Task execution right.
export function getApprovedDecision(id: string) {
  return withGovernanceLedger((ledger) => {
    const matches = Object.values(ledger.repositories).flatMap((entry) =>
      (entry.approvedDecisions ?? []).filter((value) => value.id === id)
    );
    if (matches.length !== 1)
      throw new Error("ApprovedDecision is unavailable.");
    const decision = matches[0];
    const { review, context, snapshot } = trustedReview(
      ledger,
      decision.reviewId
    );
    if (
      review.resolution?.action.action !== "approve" ||
      review.resolution.id !== decision.approvalRecordId ||
      review.binding !== decision.reviewBinding
    )
      throw new Error("ApprovedDecision has no matching Human approval.");
    return structuredClone({ decision, review, context, snapshot });
  });
}
