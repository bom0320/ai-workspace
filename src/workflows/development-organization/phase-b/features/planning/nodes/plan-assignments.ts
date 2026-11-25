import {
  prepareAssignmentPlan,
  type AssignmentPlanAgent,
} from "@/application/planning/index.js";
import type { PhaseBState } from "../../../state.js";

export function createPlanAssignmentsNode(
  agent: AssignmentPlanAgent | undefined,
  hasDetailedPlanning: boolean,
  executionWorkItemId?: string
) {
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

    const assignmentPlanResult = await prepareAssignmentPlan(
      handoffResult.handoff,
      workDecompositionResult,
      selectedWorkItemIds,
      agent
    );
    const result: Partial<PhaseBState> = { assignmentPlanResult };
    if (assignmentPlanResult.status !== "prepared") return result;
    if (executionWorkItemId !== undefined)
      result.executionPreparationResult = {
        status: "blocked",
        workItemId: executionWorkItemId,
        reason: "Direct Work Item execution requires Assignment Authorization.",
      };
    if (hasDetailedPlanning)
      result.deferredDetailedPlanningIds = [
        ...assignmentPlanResult.plan.selectedWorkItemIds,
      ];
    return result;
  };
}
