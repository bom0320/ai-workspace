// Narrow internal integration: raw Review registration is not a public Governance API.
import { registerDirectionReview } from "@/application/governance/approval/features/direction-review/flow/review-management.js";
import {
  runSynthesis,
  type RunSynthesisOptions,
  type SynthesisContext,
} from "@/application/synthesis/index.js";
import { getDirectionReview } from "@/application/governance/index.js";
import type { PhaseAState } from "../../../state.js";
import { assertCurrentAnalysis } from "@/application/governance/records/analysis/analysis-provenance.js";

export function createRunCEOSynthesisNode(
  options: RunSynthesisOptions = {},
  { directionReview: reviewEnabled = false }: { directionReview?: boolean } = {}
) {
  return async (state: PhaseAState): Promise<Partial<PhaseAState>> => {
    // 1. Require Completed Decisions and a Successful Comparison Stage
    const decisions = state.specialistDecisionsResult;
    const comparison = state.decisionComparisonResult;
    if (
      decisions?.status !== "completed" ||
      !comparison ||
      comparison.status === "failed"
    )
      return {
        synthesisResult: {
          status: "failed",
          failure: "invalid-input",
          reason:
            "Synthesis requires completed Decisions and completed or legitimately skipped Comparison.",
        },
      };

    // 2. Select Original Analysis or a Recorded Human Revision Request
    const previousReviewId =
      reviewEnabled &&
      state.directionGovernanceResult?.status === "revision-requested"
        ? state.directionGovernanceResult.reviewId
        : undefined;
    let context: SynthesisContext;
    try {
      context = previousReviewId
        ? loadRevisionContext(previousReviewId)
        : {
            ...state.specialistComparisonContext!,
            assignments: state.synthesisAssignments!,
            decisions: decisions.decisions,
            comparison,
          };
      if (
        !previousReviewId &&
        state.analysisRepresentatives &&
        state.approvalResult?.status === "approved"
      )
        assertCurrentAnalysis(
          state.approvalResult.scope.id,
          context,
          state.analysisRepresentatives.map(({ invocationId }) => invocationId)
        );
    } catch {
      return {
        directionReview: undefined,
        directionAction: undefined,
        directionGovernanceResult: {
          status: "failed",
          reason: "Recorded Synthesis revision context could not be verified.",
        },
      };
    }

    // 3. Execute Synthesis Without Granting Scope or Invocation Authority
    const synthesisResult = await runSynthesis(context, options);
    if (!reviewEnabled) return { synthesisResult };

    // 4. Preserve the Exact Analysis and Validated Proposal for Human Review
    // Registration is internal and follows the real Application call; State flags
    // or Resume data never select a supplied Proposal for approval.
    try {
      let directionReview: PhaseAState["directionReview"];
      if (synthesisResult.status === "proposed") {
        if (state.approvalResult?.status !== "approved")
          throw new Error("Approved Scope is unavailable.");
        directionReview = registerDirectionReview(
          state.approvalResult.scope.id,
          context,
          synthesisResult.proposal,
          previousReviewId,
          state.analysisRepresentatives?.map(({ invocationId }) => invocationId)
        );
      }
      return {
        synthesisResult,
        directionReview,
        directionAction: undefined,
        directionGovernanceResult: undefined,
      };
    } catch {
      return {
        synthesisResult,
        directionReview: undefined,
        directionAction: undefined,
        directionGovernanceResult: {
          status: "failed",
          reason:
            "Validated Synthesis could not be registered for Human review.",
        },
      };
    }
  };
}

function loadRevisionContext(reviewId: string): SynthesisContext {
  const { review, context } = getDirectionReview(reviewId);
  const action = review.resolution?.action;
  if (action?.action !== "request-revision")
    throw new Error("Recorded revision request is unavailable.");
  return {
    ...context,
    revision: { previousProposal: review.proposal, feedback: action.feedback },
  };
}
