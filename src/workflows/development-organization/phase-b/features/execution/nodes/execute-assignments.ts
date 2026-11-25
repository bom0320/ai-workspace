import type { PhaseBState } from "../../../state.js";
import {
  executeAssignmentPlan,
  type CollaborativeExecutionOptions,
} from "../coordination/execute-assignment-plan.js";

export function createExecuteAssignmentsNode(
  options?: CollaborativeExecutionOptions
) {
  const configured = options && structuredClone(options);
  return async (state: PhaseBState): Promise<Partial<PhaseBState>> => {
    const { handoffResult, assignmentPlanResult, selectedWorkItemIds } = state;
    if (
      !configured ||
      !selectedWorkItemIds?.length ||
      handoffResult?.status !== "accepted" ||
      assignmentPlanResult?.status !== "prepared"
    )
      return {};
    const assignmentExecutionResult = await executeAssignmentPlan(
      handoffResult.handoff,
      assignmentPlanResult.plan.id,
      selectedWorkItemIds,
      configured
    );
    return { assignmentExecutionResult };
  };
}
