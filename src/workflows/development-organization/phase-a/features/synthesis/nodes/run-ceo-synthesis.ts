import {
  runSynthesis,
  type RunSynthesisOptions,
  type SynthesisContext,
  type SynthesisResult,
} from "@/application/synthesis/index.js";
import {
  getDirectionReview,
  registerDirectionReview,
} from "@/application/governance/index.js";
import type { PhaseAState } from "../../../state.js";

export function createRunCEOSynthesisNode(
  options: RunSynthesisOptions = {},
  prepareReview = false
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
    let synthesisResult: SynthesisResult | undefined;
    try {
      // 2. Reuse Original Analysis; Revisions Add Only Recorded Human Feedback
      let context: SynthesisContext = {
        ...state.specialistComparisonContext!,
        assignments: state.synthesisAssignments!,
        decisions: decisions.decisions,
        comparison,
      };
      let previousReviewId: string | undefined;
      if (
        prepareReview &&
        state.directionGovernanceResult?.status === "revision-requested"
      ) {
        previousReviewId = state.directionGovernanceResult.reviewId;
        const previous = getDirectionReview(previousReviewId);
        if (previous.review.resolution?.action.action !== "request-revision")
          throw new Error("Recorded revision request is unavailable.");
        context = {
          ...previous.context,
          revision: {
            previousProposal: previous.review.proposal,
            feedback: previous.review.resolution.action.feedback,
          },
        };
      }
      synthesisResult = await runSynthesis(context, options);
      // 3. Register Validated Provenance Before Graph Serialization
      // A separate preparation Node would receive a copied result, not the
      // Application's one-use validated result. Graph State never authenticates it.
      const directionReview =
        prepareReview && synthesisResult.status === "proposed"
          ? registerDirectionReview(
              state.approvalResult?.status === "approved"
                ? state.approvalResult.scope.id
                : "",
              synthesisResult,
              previousReviewId
            )
          : undefined;
      return {
        synthesisResult,
        ...(prepareReview
          ? {
              directionReview,
              directionAction: undefined,
              directionGovernanceResult: undefined,
            }
          : {}),
      };
    } catch {
      return {
        ...(synthesisResult ? { synthesisResult } : {}),
        directionReview: undefined,
        directionAction: undefined,
        directionGovernanceResult: {
          status: "failed",
          reason:
            "Validated Synthesis provenance could not be registered for Human review.",
        },
      };
    }
  };
}
