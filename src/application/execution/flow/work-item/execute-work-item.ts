import {
  authorizeExecutionForRun,
  executionRequestSchema,
} from "@/application/governance/index.js";
import type { ExecutionOutcome } from "../../data-flow/work-item/output.js";
import { checkGovernedWorkerRuntime } from "../check-execution-runtime.js";
import { runExecutionPipeline } from "../orchestration/run-execution-pipeline.js";

export async function executeWorkItem(
  input: unknown
): Promise<ExecutionOutcome> {
  const parsed = executionRequestSchema.safeParse(input);
  if (!parsed.success || !parsed.data.task.allowedPaths.length)
    return { status: "denied", reason: "Invalid execution request." };

  const request = { ...parsed.data, workerMode: "codex-worktree" as const };
  const workItemId = request.workItem.id;
  const runtime = checkGovernedWorkerRuntime(request);
  if (runtime.status === "blocked") return { ...runtime, workItemId };

  const authorization = authorizeExecutionForRun(request);
  if (authorization.status !== "authorized")
    return { ...authorization, workItemId };

  const execution = authorization.execution;
  if ("goal" in execution)
    return {
      status: "denied",
      workItemId,
      reason: "Modification authorization lacks a TaskContract.",
    };
  const result = await runExecutionPipeline(execution, runtime.temporaryRoot);
  return {
    status: "executed",
    workItemId: authorization.execution.request.workItem.id,
    result,
  };
}
