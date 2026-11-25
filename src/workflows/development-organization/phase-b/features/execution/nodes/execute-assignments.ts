import type { AssignmentExecutionInput } from "../../../data-flow/assignment-execution/input.js";
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
    const {
      handoff,
      handoffResult,
      assignmentPlanResult,
      selectedWorkItemIds,
    } = state;
    if (
      !configured ||
      !selectedWorkItemIds?.length ||
      handoffResult?.status !== "accepted" ||
      assignmentPlanResult?.status !== "prepared"
    )
      return {};
    const input: AssignmentExecutionInput = {
      handoff,
      plan: assignmentPlanResult.plan,
      selectedWorkItemIds,
    };
    const assignmentExecutionResult = await coordinateAssignmentExecutions(
      input,
      configured
    );
    return { assignmentExecutionResult };
  };
}
