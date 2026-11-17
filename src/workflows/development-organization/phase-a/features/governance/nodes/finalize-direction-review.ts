import {
  prepareDirectionConfirmation,
  finalizeDirectionReview,
  type DirectionConfirmationRequest,
} from "@/application/governance/index.js";
import type { HumanConfirmation } from "@/infrastructure/terminal/index.js";
import type { PhaseAState } from "../../../state.js";

export type DirectionConfirmationOptions = {
  confirmDirection?: (
    request: DirectionConfirmationRequest
  ) => HumanConfirmation | null | Promise<HumanConfirmation | null>;
};

export function createFinalizeDirectionReviewNode(
  confirm?: DirectionConfirmationOptions["confirmDirection"]
) {
  return async (state: PhaseAState): Promise<Partial<PhaseAState>> => {
    // 1. Reload the Trusted Review and Bind the Exact Human Action
    let request: DirectionConfirmationRequest;
    try {
      request = prepareDirectionConfirmation(state.directionAction);
    } catch {
      return {
        directionGovernanceResult: {
          status: "denied",
          reason: "Current Direction Review or action could not be verified.",
        },
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
      };
    }
    // 3. Revalidate Current Governance After Human Interaction and Finalize
    return {
      directionGovernanceResult: finalizeDirectionReview(
        request.action,
        receipt ?? undefined
      ),
    };
  };
}
