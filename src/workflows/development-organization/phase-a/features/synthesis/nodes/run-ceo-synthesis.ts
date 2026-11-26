import type { PhaseANodeInput, PhaseANodeOutput } from "../../../data-flow.js";
// Narrow internal integration: raw Review registration is not a public Governance API.
import { registerDirectionReview } from "@/application/governance/approval/features/direction-review/flow/review-management.js";
import {
  runSynthesis,
  type RunSynthesisOptions,
  type SynthesisContext,
} from "@/application/management/decision-support/synthesis/index.js";
import {
  getDirectionReview,
  proposeExecutionDelegation,
  type ExecutionDelegationProposalAgent,
} from "@/application/governance/index.js";
import { assertCurrentAnalysis } from "@/application/governance/records/analysis/analysis-provenance.js";

export function createRunCEOSynthesisNode(
  options: RunSynthesisOptions = {},
  {
    requireHandoff = false,
    executionDelegationProposalAgent,
  }: {
    requireHandoff?: boolean;
    executionDelegationProposalAgent?: ExecutionDelegationProposalAgent;
  } = {}
) {
  return async (
    state: PhaseANodeInput<"run-ceo-synthesis">
  ): Promise<PhaseANodeOutput<"run-ceo-synthesis">> => {
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
        ...(requireHandoff && {
          phaseACompletion: {
            status: "blocked" as const,
            reason: "Synthesis could not be prepared for joint Human approval.",
          },
        }),
      };

    // 2. Select Original Analysis or a Recorded Human Revision Request
    const previousReviewId =
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
        ...(requireHandoff && {
          phaseACompletion: {
            status: "blocked" as const,
            reason: "Synthesis could not be prepared for joint Human approval.",
          },
        }),
      };
    }

    // 3. Execute Synthesis Without Granting Scope or Invocation Authority
    const synthesisResult = await runSynthesis(context, options);

    // 4. Preserve the Exact Analysis and Validated Proposal for Human Review
    // Registration is internal and follows the real Application call; State flags
    // or Resume data never select a supplied Proposal for approval.
    try {
      let directionReview: PhaseANodeOutput<"run-ceo-synthesis">["directionReview"];
      if (synthesisResult.status === "proposed") {
        if (state.approvalResult?.status !== "approved")
          throw new Error("Approved Scope is unavailable.");
        const { revision: _revision, ...analysis } = context;
        const executionDelegationProposal = await proposeExecutionDelegation(
          state.approvalResult.scope.snapshot.repositoryRoot,
          analysis,
          synthesisResult.proposal,
          executionDelegationProposalAgent
        );
        if (requireHandoff && !executionDelegationProposal)
          return {
            synthesisResult,
            directionReview: undefined,
            directionAction: undefined,
            directionGovernanceResult: undefined,
            phaseACompletion: {
              status: "blocked",
              reason: "A valid Execution Delegation proposal is required.",
            },
          };
        directionReview = registerDirectionReview(
          state.approvalResult.scope.id,
          context,
          synthesisResult.proposal,
          previousReviewId,
          state.analysisRepresentatives?.map(
            ({ invocationId }) => invocationId
          ),
          executionDelegationProposal
        );
      }
      return {
        synthesisResult,
        directionReview,
        directionAction: undefined,
        directionGovernanceResult: undefined,
        ...(requireHandoff && {
          phaseACompletion: directionReview?.executionDelegationProposal
            ? {
                status: "incomplete" as const,
                reason: "Joint Human approval is pending.",
              }
            : {
                status: "blocked" as const,
                reason: "A current Execution Delegation proposal is required.",
              },
        }),
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
        ...(requireHandoff && {
          phaseACompletion: {
            status: "blocked" as const,
            reason: "Synthesis could not be prepared for joint Human approval.",
          },
        }),
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
