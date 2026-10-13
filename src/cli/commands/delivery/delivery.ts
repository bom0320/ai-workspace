import type { ExecutionResult } from "@/application/execution/index.js";
import { runApplyCommand, type ApplyResult } from "./apply.js";
import { runCommitCommand, type CommitResult } from "./commit.js";
import { runPushCommand, type PushResult } from "./push.js";

export type DeliveryResult = {
  apply: ApplyResult;
  commit?: CommitResult;
  push?: PushResult;
};

export async function runPostExecutionDelivery({ repositoryRoot, executionResult }: {
  repositoryRoot: string;
  executionResult: ExecutionResult;
}): Promise<DeliveryResult> {
  const apply = await runApplyCommand(repositoryRoot, executionResult);
  const result: DeliveryResult = { apply };
  if (apply.status !== "applied") return result;
  result.commit = await runCommitCommand(repositoryRoot, executionResult.evidence.changedPaths ?? []);
  if (result.commit.status !== "committed") return result;
  result.push = await runPushCommand(repositoryRoot, result.commit.commitSha);
  return result;
}
