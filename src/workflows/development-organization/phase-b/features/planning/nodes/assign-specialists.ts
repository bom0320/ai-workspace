import {
  createAssignmentPlan,
  type AssignmentPlanAgent,
} from "@/application/planning/index.js";
import type { PhaseBState } from "../../../state.js";

export function createAssignSpecialistsNode(agent?: AssignmentPlanAgent) {
  return async (state: PhaseBState): Promise<Partial<PhaseBState>> => {
    const { handoffResult, workDecompositionResult, selectedWorkItemIds } =
      state;
    if (
      !agent ||
      handoffResult?.status !== "accepted" ||
      workDecompositionResult?.status !== "proposed" ||
      !selectedWorkItemIds?.length
    )
      return {};

    const assignmentPlanResult = await createAssignmentPlan(
      handoffResult.handoff,
      workDecompositionResult,
      selectedWorkItemIds,
      agent
    );
    return { assignmentPlanResult };
  };
}
