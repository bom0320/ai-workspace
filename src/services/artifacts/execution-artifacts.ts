import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";

import type { TaskContract } from "@/contracts/task.js";
import {
  getRepositoryHead,
  writeWorkspacePatch,
  WorkspacePatchCleanupError,
} from "@/infrastructure/git/index.js";

function errorDetail(error: unknown): string {
  if (
    typeof error === "object" &&
    error !== null &&
    "stderr" in error &&
    Buffer.isBuffer(error.stderr) &&
    error.stderr.length > 0
  ) {
    return error.stderr.toString("utf8").trim();
  }

  return error instanceof Error ? error.message : String(error);
}

export function createExecutionRun(
  task: TaskContract,
  runsRoot = resolve(process.cwd(), ".ai-workspace", "runs")
): string {
  try {
    mkdirSync(runsRoot, { recursive: true });
    const runDirectory = mkdtempSync(join(runsRoot, "run-"));
    writeFileSync(
      join(runDirectory, "task.json"),
      `${JSON.stringify(task, null, 2)}\n`
    );
    return resolve(runDirectory);
  } catch (error) {
    throw new Error(
      `Failed to create execution result directory: ${errorDetail(error)}`,
      {
        cause: error,
      }
    );
  }
}

export function getExecutionBaseCommit(workspaceRoot: string): string {
  try {
    return getRepositoryHead(workspaceRoot);
  } catch (error) {
    throw new Error(
      `Failed to determine patch base commit: ${errorDetail(error)}`,
      {
        cause: error,
      }
    );
  }
}

export function preserveExecutionChanges(
  workspaceRoot: string,
  runDirectory: string,
  baseCommit: string
): void {
  const patchPath = join(runDirectory, "changes.patch");
  try {
    writeFileSync(join(runDirectory, "base-commit.txt"), `${baseCommit}\n`);
    writeWorkspacePatch(workspaceRoot, baseCommit, patchPath);
  } catch (error) {
    // Cleanup failures previously escaped the finally block without the
    // preservation wrapper, taking precedence over any generation failure.
    if (error instanceof WorkspacePatchCleanupError) throw error.cause;
    throw new Error(
      `Failed to preserve execution changes: ${errorDetail(error)}`,
      { cause: error }
    );
  }
}

export function writeExecutionResult(
  runDirectory: string,
  result: object
): void {
  try {
    writeFileSync(
      join(runDirectory, "result.json"),
      `${JSON.stringify(result, null, 2)}\n`
    );
  } catch (error) {
    throw new Error(
      `Failed to write final execution result: ${errorDetail(error)}`,
      {
        cause: error,
      }
    );
  }
}
