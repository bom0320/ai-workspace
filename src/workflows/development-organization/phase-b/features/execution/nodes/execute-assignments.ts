import type { PhaseBState } from "../../../state.js";
import {
  executeAssignmentPlan,
  type CollaborativeExecutionOptions,
} from "../coordination/execute-assignment-plan.js";

export function createExecuteAssignmentsNode(
  options?: CollaborativeExecutionOptions
) {
  const configured = options && structuredClone(options);
  return async ({
    handoffResult,
    assignmentPlanResult,
  }: PhaseBState): Promise<Partial<PhaseBState>> => {
    if (
      !configured ||
      handoffResult?.status !== "accepted" ||
      assignmentPlanResult?.status !== "prepared"
    )
      return {};
    return {
      assignmentExecutionResult: await executeAssignmentPlan(
        handoffResult.handoff,
        assignmentPlanResult.plan.id,
        configured
      ),
    };
  };
}
