import {
  prepareAssignmentPlan,
  type AssignmentPlanAgent,
} from "@/application/planning/index.js";
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

    const pendingPlanningIds: string[] = [];
    const deferredDetailedPlanningIds: string[] = [];
    for (const id of selectedWorkItemIds) {
      const item = workDecompositionResult.workItems.find(
        (workItem) => workItem.id === id
      );
      if (item?.workType !== "repository-modification") continue;
      const workers = assignmentPlanResult.plan.assignments.filter(
        ({ workItemId, executor }) =>
          workItemId === id && executor.kind === "worker"
      );
      if (
        !item.dependsOn.length &&
        workers.length === 1 &&
        !workers[0].dependsOn.length
      )
        pendingPlanningIds.push(id);
      else deferredDetailedPlanningIds.push(id);
    }
    return {
      ...result,
      pendingPlanningIds,
      deferredDetailedPlanningIds,
    };
  };
}
