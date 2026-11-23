import {
  prepareAssignmentPlan,
  type AssignmentPlanAgent,
} from "@/application/assignment-planning/index.js";
import type { PhaseBState } from "../../../state.js";

export function createPrepareAssignmentsNode(agent?: AssignmentPlanAgent) {
  return async (state: PhaseBState): Promise<Partial<PhaseBState>> => {
    const { handoffResult, workDecompositionResult, pendingPlanningIds } =
      state;
    if (
      !agent ||
      handoffResult?.status !== "accepted" ||
      workDecompositionResult?.status !== "proposed" ||
      !pendingPlanningIds?.length
    )
      return {};

    return {
      assignmentPlanResult: await prepareAssignmentPlan(
        handoffResult.handoff,
        workDecompositionResult,
        pendingPlanningIds,
        agent
      ),
      pendingPlanningIds: [],
    };
  };
}
