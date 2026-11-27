import type { PhaseBNodeInput, PhaseBNodeOutput } from "../../../data-flow.js";
import {
  coordinateAssignmentExecutions,
  type AssignmentExecutionOptions,
} from "../coordination/coordinate-assignment-executions.js";

export function createExecuteAssignmentsNode(
  options?: AssignmentExecutionOptions
) {
  const configured = options && structuredClone(options);
  return async (
    state: PhaseBNodeInput<"execute-assignments">
  ): Promise<PhaseBNodeOutput<"execute-assignments">> => {
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
    const input = {
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
