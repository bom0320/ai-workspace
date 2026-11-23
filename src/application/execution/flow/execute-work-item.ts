import {
  authorizeExecutionForRun,
  executionRequestSchema,
} from "@/application/governance/index.js";
import type { ExecutionOutcome } from "../model/result.js";
import { checkGovernedWorkerRuntime } from "../worker/check-governed-worker-runtime.js";
import { runExecutionPipeline } from "./run-execution-pipeline.js";

export async function executeWorkItem(
  input: unknown
): Promise<ExecutionOutcome> {
  const parsed = executionRequestSchema.safeParse(input);
  if (!parsed.success)
    return { status: "denied", reason: "Invalid execution request." };

  const request = { ...parsed.data, workerMode: "codex-worktree" as const };
  const workItemId = request.workItem.id;
  const runtime = checkGovernedWorkerRuntime(request);
  if (runtime.status === "blocked") return { ...runtime, workItemId };

  const authorization = authorizeExecutionForRun(request);
  if (authorization.status !== "authorized")
    return { ...authorization, workItemId };

  const result = await runExecutionPipeline(
    authorization.execution,
    runtime.temporaryRoot
  );
  return {
    status: "executed",
    workItemId: authorization.execution.request.workItem.id,
    result,
  };
}
