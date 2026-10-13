import { join } from "node:path";

import type { ExecutionResult } from "@/application/execution/index.js";
import { getWorkspaceDiff } from "@/infrastructure/git/index.js";
import { completeReview } from "../../prompts/review.js";

export type ReviewResult =
  | { status: "continued" | "aborted" }
  | { status: "failed"; reason: string };

export async function runReviewStage(execution: ExecutionResult): Promise<ReviewResult> {
  if (!execution.workspace || !execution.artifacts?.baseCommit) {
    return { status: "failed", reason: "Execution workspace or base commit is unavailable." };
  }
  try {
    console.log(`\nReview\n------\nWorkspace:\n${execution.workspace.path}`);
    const paths = execution.evidence.changedPaths ?? [];
    const pathOutput = paths.map((path) => `- ${path}`).join("\n");
    console.log(`Changed Paths:\n${pathOutput.slice(0, 16 * 1024)}${pathOutput.length > 16 * 1024 ? "\nChanged paths truncated." : ""}`);
    const diff = getWorkspaceDiff(execution.workspace.path, execution.artifacts.baseCommit);
    console.log(`Changes:\n--------------------------------------------------\n${diff.content}\n--------------------------------------------------`);
    if (diff.truncated) console.log(`Diff truncated. Full changes are available in:\n${execution.workspace.path}`);
    console.log(`Patch artifact:\n${join(execution.artifacts.directory, "changes.patch")}`);
    if (execution.evidence.workerOutput !== undefined) {
      const output = execution.evidence.workerOutput;
      console.log(`Worker Result:\n${output.slice(0, 16 * 1024)}${output.length > 16 * 1024 ? "\nWorker output truncated." : ""}`);
    }
    return { status: await completeReview() ? "continued" : "aborted" };
  } catch (error) {
    const reason = error instanceof Error ? error.message : "Unable to review execution workspace.";
    console.log(`Review failed: ${reason}`);
    return { status: "failed", reason };
  }
}
