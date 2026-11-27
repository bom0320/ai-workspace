import {
  integrateAssignmentResults,
  type AssignmentIntegrationOutput,
} from "@/application/integration/assignment/index.js";
import type { PhaseBNodeInput, PhaseBNodeOutput } from "../../../data-flow.js";

export async function integrateAssignments({
  handoff,
  assignmentExecutionResult,
}: PhaseBNodeInput<"integrate-assignments">): Promise<
  PhaseBNodeOutput<"integrate-assignments">
> {
  if (
    !assignmentExecutionResult ||
    !("workItemExecutionStatuses" in assignmentExecutionResult)
  )
    return {};
  const { planId, workItemExecutionStatuses } = assignmentExecutionResult;
  const workItemResults: AssignmentIntegrationOutput[] = [];
  for (const { workItemId, status } of workItemExecutionStatuses) {
    if (status === "execution-completed")
      workItemResults.push(
        await integrateAssignmentResults({ handoff, planId, workItemId })
      );
  }
  return { workItemResults };
}
