import { execFileSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import {
  closeSync,
  mkdirSync,
  mkdtempSync,
  openSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { join, resolve } from "node:path";

import type { TaskContract } from "@/contracts/task.js";

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
  runsRoot = resolve(process.cwd(), ".ai-workspace", "runs"),
): string {
  try {
    mkdirSync(runsRoot, { recursive: true });
    const runDirectory = mkdtempSync(join(runsRoot, "run-"));
    writeFileSync(
      join(runDirectory, "task.json"),
      `${JSON.stringify(task, null, 2)}\n`,
    );
    return resolve(runDirectory);
  } catch (error) {
    throw new Error(`Failed to create execution result directory: ${errorDetail(error)}`, {
      cause: error,
    });
  }
}

export function getExecutionBaseCommit(workspaceRoot: string): string {
  try {
    return execFileSync("git", ["-C", workspaceRoot, "rev-parse", "HEAD"], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
    }).trim();
  } catch (error) {
    throw new Error(`Failed to determine patch base commit: ${errorDetail(error)}`, {
      cause: error,
    });
  }
}

export function preserveExecutionChanges(
  workspaceRoot: string,
  runDirectory: string,
  baseCommit: string,
): void {
  const temporaryIndex = join(runDirectory, `.patch-index-${randomUUID()}`);
  const patchPath = join(runDirectory, "changes.patch");
  const gitEnvironment = {
    ...process.env,
    GIT_INDEX_FILE: temporaryIndex,
  };
  let patchDescriptor: number | undefined;

  try {
    writeFileSync(join(runDirectory, "base-commit.txt"), `${baseCommit}\n`);
    execFileSync("git", ["-C", workspaceRoot, "read-tree", baseCommit], {
      env: gitEnvironment,
      stdio: ["ignore", "pipe", "pipe"],
    });
    execFileSync("git", ["-C", workspaceRoot, "add", "-A", "--"], {
      env: gitEnvironment,
      stdio: ["ignore", "pipe", "pipe"],
    });

    patchDescriptor = openSync(patchPath, "w");
    execFileSync(
      "git",
      [
        "-C",
        workspaceRoot,
        "diff",
        "--cached",
        "--binary",
        "--full-index",
        "--no-color",
        baseCommit,
        "--",
      ],
      {
        env: gitEnvironment,
        stdio: ["ignore", patchDescriptor, "pipe"],
      },
    );
  } catch (error) {
    throw new Error(`Failed to preserve execution changes: ${errorDetail(error)}`, {
      cause: error,
    });
  } finally {
    if (patchDescriptor !== undefined) {
      closeSync(patchDescriptor);
    }
    rmSync(temporaryIndex, { force: true });
  }
}

export function writeExecutionResult(
  runDirectory: string,
  result: object,
): void {
  try {
    writeFileSync(
      join(runDirectory, "result.json"),
      `${JSON.stringify(result, null, 2)}\n`,
    );
  } catch (error) {
    throw new Error(`Failed to write final execution result: ${errorDetail(error)}`, {
      cause: error,
    });
  }
}
