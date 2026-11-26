import { fingerprintExecutionArtifacts } from "@/services/artifacts/index.js";
import {
  runTaskExecution,
  checkGovernedWorkerRuntime,
} from "@/application/task-execution/index.js";
import {
  AssignmentExecutionError,
  reserveAssignmentExecution,
  claimAssignmentExecution,
  consumeAssignmentWriteExecution,
  recordAssignmentFailure,
} from "@/application/governance/index.js";
import { RepositorySnapshotMismatchError } from "@/services/repository-snapshot/index.js";
import type { AssignmentExecutionInput } from "../../data-flow/input.js";
import type { AssignmentExecutionOutput } from "../../data-flow/output.js";

export async function executeBoundTaskContract(
  handoff: AssignmentExecutionInput["handoff"],
  request: Extract<AssignmentExecutionInput["request"], { access: "write" }>
): Promise<AssignmentExecutionOutput> {
  let writeExecutionId: string | undefined;
  let failureStage: "authority" | "claim" | "execution" | "handoff" =
    "authority";
  try {
    const runtime = checkGovernedWorkerRuntime({
      repositoryPath: handoff.executionDelegation.repositoryRoot,
      timeoutMs: request.timeoutMs,
    });
    if (runtime.status === "blocked")
      return { status: "denied", failure: "runtime" };
    const writePermit = reserveAssignmentExecution(handoff, request);
    writeExecutionId = writePermit.id;
    failureStage = "claim";
    const claimedWriteExecution = claimAssignmentExecution(
      handoff,
      writePermit
    );
    const execution = consumeAssignmentWriteExecution(
      handoff,
      claimedWriteExecution
    );
    failureStage = "execution";
    const taskExecutionResult = await runTaskExecution(
      execution,
      runtime.temporaryRoot
    );
    failureStage = "handoff";
    if (
      !taskExecutionResult.artifacts ||
      (taskExecutionResult.passed &&
        (!taskExecutionResult.scope?.passed ||
          !taskExecutionResult.evidence.verification?.passed ||
          taskExecutionResult.artifacts?.baseCommit !==
            execution.snapshot.commitSha))
    )
      throw new AssignmentExecutionError("execution");

    let artifacts: ReturnType<typeof fingerprintExecutionArtifacts>;
    try {
      artifacts = fingerprintExecutionArtifacts(
        taskExecutionResult.artifacts.directory,
        taskExecutionResult,
        !!taskExecutionResult.workspace
      );
    } catch (error) {
      if (taskExecutionResult.passed) throw error;
      // A failed pipeline may have a valid report without a preserved patch.
      artifacts = fingerprintExecutionArtifacts(
        taskExecutionResult.artifacts.directory,
        taskExecutionResult,
        false
      );
    }
    const recorded = execution.recordResult({
      passed: taskExecutionResult.passed,
      artifacts,
    });
    return taskExecutionResult.passed
      ? {
          status: "write-completed",
          ...recorded,
          artifacts,
          specialistId: execution.specialistId,
          workItemId: execution.workItemId,
          assignmentId: request.assignmentId,
          taskContractBinding: request.taskContractBinding,
        }
      : {
          status: "failed",
          failure: "execution",
          failureRecorded: true,
          ...recorded,
          artifacts,
        };
  } catch (error) {
    const failure =
      error instanceof AssignmentExecutionError
        ? error.failure
        : error instanceof RepositorySnapshotMismatchError
          ? "snapshot"
          : failureStage;
    if (!writeExecutionId) return { status: "denied", failure };
    let failureRecorded = false;
    try {
      recordAssignmentFailure(
        handoff,
        request.planId,
        writeExecutionId,
        failure
      );
      failureRecorded = true;
    } catch {
      // A consumed Write claim cannot be retried when recording fails.
    }
    return {
      status: "failed",
      failure,
      invocationId: writeExecutionId,
      failureRecorded,
    };
  }
}
