import { ZodError } from "zod";
import {
  DecisionValidationError,
  loadSnapshotFiles,
  runIndependentDecisions,
} from "@/application/decision/index.js";
import {
  authorizeExecutionForRun,
  executionRequestSchema,
} from "@/application/governance/index.js";
import type { ReadOnlyExecutionOutcome } from "../model/result.js";
import { checkGovernedWorkerRuntime } from "../worker/check-governed-worker-runtime.js";

export async function executeReadOnlyWorkItem(
  input: unknown
): Promise<ReadOnlyExecutionOutcome> {
  const parsed = executionRequestSchema.safeParse(input);
  if (!parsed.success || parsed.data.workItem.workType !== "read-only")
    return {
      status: "denied",
      reason: "An explicit read-only Work Item is required.",
    };

  const request = parsed.data;
  const workItemId = request.workItem.id;
  const runtime = checkGovernedWorkerRuntime(request);
  if (runtime.status === "blocked") return { ...runtime, workItemId };

  const authorization = authorizeExecutionForRun(request);
  if (authorization.status !== "authorized")
    return { ...authorization, workItemId };

  const { request: approved, snapshot, expiresAt } = authorization.execution;
  const deadline = performance.now() + approved.timeoutMs;
  const remaining = () =>
    Math.floor(
      Math.min(deadline - performance.now(), Date.parse(expiresAt) - Date.now())
    );
  try {
    let files: ReturnType<typeof loadSnapshotFiles>;
    try {
      files = loadSnapshotFiles(snapshot, approved.readPaths);
    } catch (error) {
      throw new DecisionValidationError(error);
    }
    // Bound the encoded Context too, since JSON escaping can expand blob contents.
    if (Buffer.byteLength(JSON.stringify(files)) > 64 * 1024)
      throw new DecisionValidationError(
        "Read-only Context exceeds the supported size."
      );

    const timeoutMs = remaining();
    if (timeoutMs < 1)
      throw new Error("Read-only execution exceeded its time limit.");
    const [decision] = await runIndependentDecisions(
      snapshot,
      {
        objective: approved.workItem.objective,
        targetRepository: approved.task.targetRepository,
        constraints: approved.task.constraints,
      },
      [
        {
          specialist: {
            id: "phase-b-read-only",
            role: "Repository analyst",
            objective:
              "Provide an independent analysis supported by the supplied evidence.",
            authority: { repositoryAccess: "read", shellExecution: false },
          },
          files,
          assignmentObjective: JSON.stringify({
            objective: approved.task.objective,
            deliverable: approved.workItem.deliverable,
            acceptanceCriteria: approved.task.acceptanceCriteria,
          }),
        },
      ],
      { timeoutMs, classifyValidationErrors: true }
    );
    if (remaining() < 1)
      throw new Error("Read-only execution exceeded its time limit.");
    if (!decision?.evidence.length)
      throw new DecisionValidationError(
        "Read-only findings require Repository evidence."
      );

    return {
      status: "executed",
      workItemId,
      result: { passed: true, decision, snapshot },
    };
  } catch (error) {
    const validationFailed =
      error instanceof DecisionValidationError ||
      error instanceof ZodError ||
      (error instanceof Error && error.cause instanceof SyntaxError);
    return {
      status: "executed",
      workItemId,
      result: {
        passed: false,
        failure: validationFailed ? "validation" : "execution",
        reason: validationFailed
          ? "Read-only Context, Snapshot, or Specialist Evidence failed validation."
          : "Read-only Specialist execution failed.",
      },
    };
  }
}
