import type {
  PhaseANodeInput,
  PhaseANodeOutput,
} from "../../../../data-flow.js";
import {
  prepareDirectionConfirmation,
  finalizeDirectionReview,
  verifyExecutionHandoff,
  type DirectionConfirmationRequest,
} from "@/application/governance/index.js";
import type { HumanConfirmation } from "@/infrastructure/terminal/index.js";

export type DirectionConfirmationOptions = {
  confirmDirection?: (
    request: DirectionConfirmationRequest
  ) => HumanConfirmation | null | Promise<HumanConfirmation | null>;
};

export function createFinalizeDirectionReviewNode(
  confirm?: DirectionConfirmationOptions["confirmDirection"],
  requireHandoff = false
) {
  return async (
    state: PhaseANodeInput<"finalize-direction-review">
  ): Promise<PhaseANodeOutput<"finalize-direction-review">> => {
    if (
      requireHandoff &&
      state.directionAction?.action === "approve" &&
      !state.directionAction.executionDelegation
    )
      return {
        phaseACompletion: {
          status: "incomplete",
          reason: "Joint direction and execution approval is required.",
        },
      };
    // 1. Reload the Trusted Review and Bind the Exact Human Action
    let request: DirectionConfirmationRequest;
    try {
      request = prepareDirectionConfirmation(state.directionAction);
      if (
        requireHandoff &&
        request.action.action === "approve" &&
        request.review.executionDelegationProposal?.policyVersion !==
          request.action.executionDelegation?.policyVersion
      )
        return {
          phaseACompletion: {
            status: "blocked",
            reason: "The Execution Delegation proposal is no longer current.",
          },
        };
    } catch {
      return {
        directionGovernanceResult: {
          status: "denied",
          reason: "Current Direction Review or action could not be verified.",
        },
        ...(requireHandoff && {
          phaseACompletion: {
            status: "blocked" as const,
            reason: "Current Review or execution policy validation failed.",
          },
        }),
      };
    }
    // 2. Wait Outside the Ledger Lock; Keep the One-use Receipt Out of State
    let receipt: HumanConfirmation | null;
    try {
      receipt = confirm ? await confirm(structuredClone(request)) : null;
    } catch {
      return {
        directionGovernanceResult: {
          status: "failed",
          reason: "Human Direction confirmation could not be completed.",
        },
        ...(requireHandoff && {
          phaseACompletion: {
            status: "denied" as const,
            reason: "Human confirmation failed.",
          },
        }),
      };
    }
    // 3. Revalidate Current Governance After Human Interaction and Finalize
    const directionGovernanceResult = finalizeDirectionReview(
      request.action,
      receipt ?? undefined
    );
    if (!requireHandoff) return { directionGovernanceResult };
    const result = directionGovernanceResult;
    if (result.status === "approved" && result.executionDelegation) {
      try {
        const handoff = verifyExecutionHandoff({
          decision: result.decision,
          executionDelegation: result.executionDelegation,
        });
        return {
          directionGovernanceResult,
          phaseACompletion: { status: "completed", ...handoff },
        };
      } catch {
        return {
          directionGovernanceResult,
          phaseACompletion: {
            status: "blocked",
            reason: "The approved Handoff could not be verified.",
          },
        };
      }
    }
    if (result.status === "denied" && result.reasonCode === "execution-policy")
      return {
        directionGovernanceResult,
        phaseACompletion: { status: "blocked", reason: result.reason },
      };
    return {
      directionGovernanceResult,
      phaseACompletion: {
        status:
          result.status === "rejected"
            ? "rejected"
            : result.status === "denied" || result.status === "failed"
              ? "denied"
              : "incomplete",
        reason: "Joint direction and execution approval was not completed.",
      },
    };
  };
}
