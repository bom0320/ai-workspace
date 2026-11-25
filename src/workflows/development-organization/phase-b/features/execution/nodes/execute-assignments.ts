import type { PhaseBState } from "../../../state.js";
import {
  coordinateAssignmentExecutions,
  type AssignmentExecutionOptions,
} from "../coordination/coordinate-assignment-executions.js";

export function createExecuteAssignmentsNode(
  options?: AssignmentExecutionOptions
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
    const assignmentExecutionResult = await coordinateAssignmentExecutions(
      handoffResult.handoff,
      assignmentPlanResult.plan.id,
      selectedWorkItemIds,
      configured
    );
    return { assignmentExecutionResult };
  };
}
