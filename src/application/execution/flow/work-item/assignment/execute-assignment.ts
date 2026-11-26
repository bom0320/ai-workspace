import { fingerprintExecutionArtifacts } from "@/services/artifacts/index.js";
import { runExecutionPipeline } from "../../orchestration/run-execution-pipeline.js";
import {
  detailAssignmentTask,
  AssignmentPlanningBlockedError,
} from "@/application/planning/index.js";
import type { AssignmentExecutionInput } from "../../../data-flow/assignment/input.js";
import type { AssignmentExecutionOutput } from "../../../data-flow/assignment/output.js";
import { ZodError } from "zod";
import { runCollaborativeSpecialist } from "@/application/decision/index.js";
import {
  AssignmentExecutionError,
  type AssignmentReadSession,
  reserveAssignmentExecution,
  claimAssignmentExecution,
  consumeAssignmentReadContext,
  consumeAssignmentWriteExecution,
  recordAssignmentFailure,
} from "@/application/governance/index.js";
import { RepositorySnapshotMismatchError } from "@/services/repository-snapshot/index.js";
import {
  checkReadOnlyRuntime,
  checkGovernedWorkerRuntime,
} from "../../check-execution-runtime.js";

export async function executeAssignment({
  handoff,
  request,
  writeTimeoutMs,
}: AssignmentExecutionInput): Promise<AssignmentExecutionOutput> {
  let stage: "authority" | "claim" | "execution" | "handoff" | "planning" =
    "authority";
  let id: string | undefined;
  try {
    if (request.access === "write")
      return await executePreparedAssignment(handoff, request);
    if (
      checkReadOnlyRuntime({
        repositoryPath: handoff.executionDelegation.repositoryRoot,
        timeoutMs: request.timeoutMs,
      }).status === "blocked"
    )
      return { status: "denied" as const, failure: "runtime" as const };
    const permit = reserveAssignmentExecution(handoff, request);
    id = permit.id;
    stage = "claim";
    const claimed = claimAssignmentExecution(handoff, permit);
    const session: AssignmentReadSession = consumeAssignmentReadContext(
      handoff,
      claimed
    );
    if (session.assignment.repositoryAccessCeiling === "write") {
      const executionBounds = session.checkWriteEligibility();
      stage = "planning";
      const result = await detailAssignmentTask({
        context: session.context,
        specialist: session.specialist,
        assignment: session.assignment,
        workItem: session.workItem,
        executionBounds,
        repositoryRoot: permit.snapshot.repositoryRoot,
        deadlineMs: session.deadlineMs,
        limits: session.inspectionLimits,
        inspect: session.inspect,
        assertEligible: () => {
          session.checkWriteEligibility();
        },
      });
      if (result.status === "failed")
        throw new AssignmentExecutionError("planning");
      stage = "handoff";
      const prepared = session.recordPreparedTask(result.task);
      return await executePreparedAssignment(handoff, {
        access: "write",
        planId: request.planId,
        assignmentId: request.assignmentId,
        taskContractBinding: prepared.taskContractBinding,
        readPaths: [],
        timeoutMs: writeTimeoutMs ?? request.timeoutMs,
      });
    }
    const timeoutMs = session.deadlineMs - Date.now();
    if (timeoutMs < 1) throw new AssignmentExecutionError("claim");
    stage = "execution";
    const decision = await runCollaborativeSpecialist(
      session.specialist,
      session.context,
      session.authority,
      { timeoutMs }
    );
    stage = "handoff";
    return {
      status: "read-completed" as const,
      ...session.recordResult(decision),
    };
  } catch (error) {
    const reason =
      error instanceof AssignmentPlanningBlockedError
        ? error.message
        : undefined;
    const failure = reason
      ? "planning-blocked"
      : error instanceof AssignmentExecutionError
        ? error.failure
        : error instanceof RepositorySnapshotMismatchError
          ? "snapshot"
          : stage !== "authority" &&
              (error instanceof ZodError ||
                (error instanceof Error && error.cause instanceof SyntaxError))
            ? "validation"
            : stage;
    if (!id) return { status: "denied" as const, failure };
    let failureRecorded = false;
    try {
      recordAssignmentFailure(handoff, request.planId, id, failure, reason);
      failureRecorded = true;
    } catch {
      // The original rejection remains observable even if persistence fails.
    }
    return {
      status: "failed" as const,
      failure,
      invocationId: id,
      failureRecorded,
      ...(reason && { reason }),
    };
  }
}

async function executePreparedAssignment(
  handoff: AssignmentExecutionInput["handoff"],
  request: Extract<AssignmentExecutionInput["request"], { access: "write" }>
): Promise<AssignmentExecutionOutput> {
  let id: string | undefined;
  let stage: "authority" | "claim" | "execution" | "handoff" = "authority";
  try {
    const runtime = checkGovernedWorkerRuntime({
      repositoryPath: handoff.executionDelegation.repositoryRoot,
      timeoutMs: request.timeoutMs,
    });
    if (runtime.status === "blocked")
      return { status: "denied", failure: "runtime" };
    const permit = reserveAssignmentExecution(handoff, request);
    id = permit.id;
    stage = "claim";
    const claimed = claimAssignmentExecution(handoff, permit);
    const execution = consumeAssignmentWriteExecution(handoff, claimed);
    stage = "execution";
    const result = await runExecutionPipeline(execution, runtime.temporaryRoot);
    stage = "handoff";
    if (
      !result.artifacts ||
      (result.passed &&
        (!result.scope?.passed ||
          !result.evidence.verification?.passed ||
          result.artifacts?.baseCommit !== execution.snapshot.commitSha))
    )
      throw new AssignmentExecutionError("execution");

    let artifacts: ReturnType<typeof fingerprintExecutionArtifacts>;
    try {
      artifacts = fingerprintExecutionArtifacts(
        result.artifacts.directory,
        result,
        !!result.workspace
      );
    } catch (error) {
      if (result.passed) throw error;
      // A failed pipeline may have a valid report without a preserved patch.
      artifacts = fingerprintExecutionArtifacts(
        result.artifacts.directory,
        result,
        false
      );
    }
    const recorded = execution.recordResult({
      passed: result.passed,
      artifacts,
    });
    return result.passed
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
          : stage;
    if (!id) return { status: "denied", failure };
    let failureRecorded = false;
    try {
      recordAssignmentFailure(handoff, request.planId, id, failure);
      failureRecorded = true;
    } catch {
      // A consumed Write claim cannot be retried when recording fails.
    }
    return { status: "failed", failure, invocationId: id, failureRecorded };
  }
}
