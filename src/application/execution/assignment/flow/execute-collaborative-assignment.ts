import { ZodError } from "zod";
import { runCollaborativeSpecialist } from "@/application/decision/index.js";
import {
  AssignmentExecutionError,
  reserveAssignmentExecution,
  claimAssignmentExecution,
  recordAssignmentResult,
  recordAssignmentFailure,
} from "@/application/governance/index.js";
import { RepositorySnapshotMismatchError } from "@/services/repository-snapshot/index.js";
import { checkReadOnlyRuntime } from "../../worker/check-execution-runtime.js";

type Handoff = Parameters<typeof reserveAssignmentExecution>[0];

export async function executeCollaborativeAssignment(
  handoff: Handoff,
  request: {
    planId: string;
    assignmentId: string;
    readPaths: string[];
    timeoutMs: number;
  }
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
    id = reserveAssignmentExecution(handoff, request);
    stage = "claim";
    const claimed = claimAssignmentExecution(handoff, request.planId, id);
    const timeoutMs = Math.min(
      claimed.timeoutMs,
      claimed.expiresAt - Date.now()
    );
    if (timeoutMs < 1) throw new AssignmentExecutionError("claim");
    stage = "execution";
    const decision = await runCollaborativeSpecialist(
      claimed.specialist,
      {
        goal: claimed.goal,
        assignmentObjective: claimed.assignment.objective,
        repositoryCommitSha: claimed.snapshot.commitSha,
        files: claimed.files,
        predecessorResults: claimed.predecessors,
      },
      { timeoutMs }
    );
    stage = "handoff";
    return {
      status: "completed" as const,
      ...recordAssignmentResult(handoff, request.planId, id, decision),
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
