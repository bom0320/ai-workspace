import { AssignmentPlanningBlockedError } from "@/application/specialist/task-detailing/index.js";
import { checkReadOnlyRuntime } from "@/application/task-execution/index.js";
import { ZodError } from "zod";
import {
  AssignmentExecutionError,
  reserveAssignmentExecution,
  claimAssignmentExecution,
  consumeAssignmentReadContext,
  recordAssignmentFailure,
} from "@/application/governance/index.js";
import { RepositorySnapshotMismatchError } from "@/services/repository-snapshot/index.js";
import type { AssignmentExecutionInput } from "../data-flow/input.js";
import type { AssignmentExecutionOutput } from "../data-flow/output.js";
import { executeBoundTaskContract } from "./task-contract/execute-bound-task-contract.js";
import { runReadAssignment } from "./run-read-assignment.js";
import { runWriteAssignment } from "./run-write-assignment.js";

export async function executeAssignment({
  handoff,
  request,
  writeTimeoutMs,
}: AssignmentExecutionInput): Promise<AssignmentExecutionOutput> {
  let failureStage:
    "authority" | "claim" | "execution" | "handoff" | "planning" = "authority";
  let readExecutionId: string | undefined;
  try {
    if (request.access === "write")
      return await executeBoundTaskContract(handoff, request);
    if (
      checkReadOnlyRuntime({
        repositoryPath: handoff.executionDelegation.repositoryRoot,
        timeoutMs: request.timeoutMs,
      }).status === "blocked"
    )
      return { status: "denied" as const, failure: "runtime" as const };
    const readPermit = reserveAssignmentExecution(handoff, request);
    readExecutionId = readPermit.id;
    failureStage = "claim";
    const claimedReadExecution = claimAssignmentExecution(handoff, readPermit);
    const readSession = consumeAssignmentReadContext(
      handoff,
      claimedReadExecution
    );
    const setFailureStage = (next: "planning" | "execution" | "handoff") => {
      failureStage = next;
    };
    if (readSession.assignment.repositoryAccessCeiling === "write")
      return await runWriteAssignment(
        { handoff, request, writeTimeoutMs },
        readSession,
        readPermit.snapshot.repositoryRoot,
        setFailureStage
      );
    return await runReadAssignment(readSession, setFailureStage);
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
          : failureStage !== "authority" &&
              (error instanceof ZodError ||
                (error instanceof Error && error.cause instanceof SyntaxError))
            ? "validation"
            : failureStage;
    if (!readExecutionId) return { status: "denied" as const, failure };
    let failureRecorded = false;
    try {
      recordAssignmentFailure(
        handoff,
        request.planId,
        readExecutionId,
        failure,
        reason
      );
      failureRecorded = true;
    } catch {
      // The original rejection remains observable even if persistence fails.
    }
    return {
      status: "failed" as const,
      failure,
      invocationId: readExecutionId,
      failureRecorded,
      ...(reason && { reason }),
    };
  }
}
