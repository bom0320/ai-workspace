import {
  prepareAssignmentPlan,
  type AssignmentPlanAgent,
} from "@/application/planning/index.js";
import { resolveDetailedPlanningReadiness } from "../coordination/resolve-detailed-planning-readiness.js";
import type { PhaseBState } from "../../../state.js";

export function createPrepareAssignmentsNode(
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
    if (executionWorkItemId !== undefined)
      result.executionPreparationResult = {
        status: "blocked",
        workItemId: executionWorkItemId,
        reason:
          "Assignment-based execution requires Assignment Authorization and Result Handoff.",
      };
    if (!hasDetailedPlanning || assignmentPlanResult.status !== "prepared")
      return result;

    const { readyWorkItemIds, deferredWorkItemIds } =
      resolveDetailedPlanningReadiness(
        selectedWorkItemIds,
        workDecompositionResult.workItems,
        assignmentPlanResult.plan.assignments
      );
    return {
      ...result,
      pendingPlanningIds: readyWorkItemIds,
      deferredDetailedPlanningIds: deferredWorkItemIds,
    };
  };
}
