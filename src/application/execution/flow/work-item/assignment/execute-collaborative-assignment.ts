import { ZodError } from "zod";
import { runCollaborativeSpecialist } from "@/application/decision/index.js";
import {
  AssignmentExecutionError,
  reserveAssignmentExecution,
  claimAssignmentExecution,
  consumeAssignmentReadContext,
  type AssignmentExecutionRequest,
  recordAssignmentFailure,
} from "@/application/governance/index.js";
import { RepositorySnapshotMismatchError } from "@/services/repository-snapshot/index.js";
import { checkReadOnlyRuntime } from "../../check-execution-runtime.js";

type Handoff = Parameters<typeof reserveAssignmentExecution>[0];

export async function executeCollaborativeAssignment(
  handoff: Handoff,
  request: Extract<AssignmentExecutionRequest, { access: "read" }>
) {
  let stage: "authority" | "claim" | "execution" | "handoff" = "authority";
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
    const session = consumeAssignmentReadContext(handoff, claimed);
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
    const failure =
      error instanceof AssignmentExecutionError
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
      recordAssignmentFailure(handoff, request.planId, id, failure);
      failureRecorded = true;
    } catch {
      // The original rejection remains observable even if persistence fails.
    }
    return {
      status: "failed" as const,
      failure,
      invocationId: id,
      failureRecorded,
    };
  }
}
