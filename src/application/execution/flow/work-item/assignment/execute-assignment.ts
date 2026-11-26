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
  recordAssignmentFailure,
} from "@/application/governance/index.js";
import { RepositorySnapshotMismatchError } from "@/services/repository-snapshot/index.js";
import { checkReadOnlyRuntime } from "../../check-execution-runtime.js";

export async function executeAssignment({
  handoff,
  request,
}: AssignmentExecutionInput): Promise<AssignmentExecutionOutput> {
  let stage: "authority" | "claim" | "execution" | "handoff" | "planning" =
    "authority";
  let id: string | undefined;
  try {
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
      return {
        status: "task-prepared",
        planFormat: "structured",
        ...session.recordPreparedTask(result.task),
      };
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
