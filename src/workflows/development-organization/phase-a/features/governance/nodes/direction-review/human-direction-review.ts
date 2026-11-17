import { interrupt } from "@langchain/langgraph";
import { directionActionSchema } from "@/application/governance/index.js";
import type { PhaseAState } from "../../../../state.js";

export function humanDirectionReview(state: PhaseAState): Partial<PhaseAState> {
  // 1. Interrupt Without Side Effects; This Node Starts Again on Resume
  if (!state.directionReview)
    return {
      directionGovernanceResult: {
        status: "failed",
        reason: "Direction Review is unavailable.",
      },
    };
  const input: unknown = interrupt({
    kind: "direction-review",
    review: state.directionReview,
  });
  // 2. Validate the Choice, Not Human Identity or Approval Authority
  const action = directionActionSchema.safeParse(input);
  if (
    !action.success ||
    action.data.reviewId !== state.directionReview.id ||
    action.data.binding !== state.directionReview.binding
  )
    return {
      directionAction: undefined,
      directionGovernanceResult: {
        status: "denied",
        reason: "Invalid Direction Review action or binding.",
      },
    };
  return { directionAction: action.data };
}
