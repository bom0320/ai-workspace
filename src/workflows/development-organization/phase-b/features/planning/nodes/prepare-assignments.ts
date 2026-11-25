import {
  prepareAssignmentPlan,
  type AssignmentPlanAgent,
} from "@/application/planning/index.js";
import type { PhaseBState } from "../../../state.js";

export function createPrepareAssignmentsNode(
  agent: AssignmentPlanAgent | undefined,
  hasDetailedPlanning: boolean,
  assignmentExecutionRequested: boolean,
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
    const reason =
      "Assignment execution requires Phase-scoped Assignment Authorization.";
    if (assignmentExecutionRequested)
      result.assignmentExecutionResult = {
        status: "denied",
        failure: "unsupported",
        planId: assignmentPlanResult.plan.id,
        reason,
      };
    if (executionWorkItemId !== undefined)
      result.executionPreparationResult = {
        status: "blocked",
        workItemId: executionWorkItemId,
        reason,
      };
    if (hasDetailedPlanning)
      result.deferredDetailedPlanningIds = [
        ...assignmentPlanResult.plan.selectedWorkItemIds,
      ];
    return result;
  };
}
