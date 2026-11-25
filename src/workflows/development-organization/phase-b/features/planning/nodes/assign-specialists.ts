import {
  createAssignmentPlan,
  type AssignmentPlanAgent,
} from "@/application/planning/index.js";
import type { PhaseBState } from "../../../state.js";

export function createAssignSpecialistsNode(agent?: AssignmentPlanAgent) {
  return async (state: PhaseBState): Promise<Partial<PhaseBState>> => {
    const {
      handoff,
      handoffResult,
      workDecompositionResult,
      selectedWorkItemIds,
    } = state;
    if (
      !agent ||
      handoffResult?.status !== "accepted" ||
      workDecompositionResult?.status !== "proposed" ||
      !selectedWorkItemIds?.length
    )
      return {};

    const assignmentPlanResult = await createAssignmentPlan(
      { handoff, proposal: workDecompositionResult, selectedWorkItemIds },
      agent
    );
    return { assignmentPlanResult };
  };
}
