import { detailAssignmentTask } from "@/application/specialist/task-detailing/index.js";
import {
  AssignmentExecutionError,
  type AssignmentReadSession,
} from "@/application/governance/index.js";

export async function prepareTaskContract(
  readSession: AssignmentReadSession,
  repositoryRoot: string,
  setFailureStage: (stage: "planning" | "handoff") => void
) {
  const executionBounds = readSession.checkWriteEligibility();
  setFailureStage("planning");
  const planningResult = await detailAssignmentTask({
    context: readSession.context,
    specialist: readSession.specialist,
    assignment: readSession.assignment,
    workItem: readSession.workItem,
    executionBounds,
    repositoryRoot,
    deadlineMs: readSession.deadlineMs,
    limits: readSession.inspectionLimits,
    inspect: readSession.inspect,
    assertEligible: () => {
      readSession.checkWriteEligibility();
    },
  });
  if (planningResult.status === "failed")
    throw new AssignmentExecutionError("planning");
  setFailureStage("handoff");
  return readSession.recordPreparedTask(planningResult.task);
}
