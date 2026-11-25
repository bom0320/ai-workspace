import type { AssignmentReadInput } from "../../../data-flow/assignment/input.js";
import type { AssignmentReadOutput } from "../../../data-flow/assignment/output.js";
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

export async function executeAssignmentRead({
  handoff,
  request,
}: AssignmentReadInput): Promise<AssignmentReadOutput> {
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
    const session: AssignmentReadSession = consumeAssignmentReadContext(
      handoff,
      claimed
    );
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
