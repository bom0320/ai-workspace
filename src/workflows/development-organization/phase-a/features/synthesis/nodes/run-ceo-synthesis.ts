import {
  runSynthesis,
  type RunSynthesisOptions,
  type SynthesisContext,
} from "@/application/synthesis/index.js";
import {
  getDirectionReview,
  type registerDirectionReview,
} from "@/application/governance/index.js";
import type { PhaseAState } from "../../../state.js";

export function createRunCEOSynthesisNode(
  options: RunSynthesisOptions = {},
  registerReview?: typeof registerDirectionReview
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
      registerReview &&
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
    if (!registerReview) return { synthesisResult };

    // 4. Register Validated Provenance Before Graph Serialization
    // A separate Node would receive a copy, not the Application's one-use result.
    // A Governance failure must preserve the already completed Stage 5 proposal.
    try {
      let directionReview: PhaseAState["directionReview"];
      if (synthesisResult.status === "proposed") {
        if (state.approvalResult?.status !== "approved")
          throw new Error("Approved Scope is unavailable.");
        directionReview = registerReview(
          state.approvalResult.scope.id,
          synthesisResult,
          previousReviewId
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
            "Validated Synthesis provenance could not be registered for Human review.",
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
