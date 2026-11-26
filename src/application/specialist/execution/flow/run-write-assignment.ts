import type { AssignmentReadSession } from "@/application/governance/index.js";
import type { AssignmentExecutionInput } from "../data-flow/input.js";
import { prepareTaskContract } from "./task-contract/prepare-task-contract.js";
import { executeBoundTaskContract } from "./task-contract/execute-bound-task-contract.js";

export async function runWriteAssignment(
  { handoff, request, writeTimeoutMs }: AssignmentExecutionInput,
  readSession: AssignmentReadSession,
  repositoryRoot: string,
  setFailureStage: (stage: "planning" | "handoff") => void
) {
  const prepared = await prepareTaskContract(
    readSession,
    repositoryRoot,
    setFailureStage
  );
  return executeBoundTaskContract(handoff, {
    access: "write",
    planId: request.planId,
    assignmentId: request.assignmentId,
    taskContractBinding: prepared.taskContractBinding,
    readPaths: [],
    timeoutMs: writeTimeoutMs ?? request.timeoutMs,
  });
}
