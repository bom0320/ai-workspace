import { randomUUID } from "node:crypto";
import { execFileSync } from "node:child_process";
import { rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

export function createExecutionWorkspace(repositoryRoot: string): string {
  const workspacePath = join(
    tmpdir(),
    `ai-workspace-execution-${randomUUID()}`
  );

  try {
    execFileSync(
      "git",
      [
        "-C",
        repositoryRoot,
        "worktree",
        "add",
        "--detach",
        workspacePath,
        "HEAD",
      ],
      { encoding: "utf8", stdio: "pipe" }
    );
  } catch (error) {
    rmSync(workspacePath, { force: true, recursive: true });

    let detail = error instanceof Error ? error.message : String(error);

    if (
      typeof error === "object" &&
      error !== null &&
      "stderr" in error &&
      typeof error.stderr === "string" &&
      error.stderr.trim()
    ) {
      detail = error.stderr.trim();
    }

    throw new Error(`Failed to create execution workspace: ${detail}`, {
      cause: error,
    });
  }

  return resolve(workspacePath);
}
