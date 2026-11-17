import { randomUUID } from "node:crypto";
import { execFileSync } from "node:child_process";
import { mkdirSync, readdirSync, rmSync, statSync, symlinkSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

function linkDependencies(repositoryRoot: string, workspacePath: string): void {
  const source = resolve(repositoryRoot, "node_modules");
  try {
    if (!statSync(source).isDirectory()) {
      throw new Error("Repository node_modules is not a directory.");
    }
  } catch (error) {
    if (error instanceof Error && "code" in error && error.code === "ENOENT")
      return;
    throw error;
  }

  // A real directory preserves Git's usual node_modules/ ignore rule.
  const destination = join(workspacePath, "node_modules");
  mkdirSync(destination);
  for (const entry of readdirSync(source, { withFileTypes: true })) {
    const target = join(source, entry.name);
    const type =
      process.platform === "win32" && statSync(target).isDirectory()
        ? "junction"
        : undefined;
    symlinkSync(target, join(destination, entry.name), type);
  }
}

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

  try {
    linkDependencies(repositoryRoot, workspacePath);
  } catch (error) {
    try {
      removeExecutionWorkspace(repositoryRoot, workspacePath);
    } catch (cleanupError) {
      throw new Error(
        `Failed to link execution workspace dependencies; cleanup also failed at ${workspacePath}.`,
        {
          cause: new AggregateError([error, cleanupError]),
        }
      );
    }
    const detail = error instanceof Error ? error.message : String(error);
    throw new Error(
      `Failed to link execution workspace dependencies: ${detail}`,
      { cause: error }
    );
  }

  return resolve(workspacePath);
}

export function removeExecutionWorkspace(
  repositoryRoot: string,
  workspaceRoot: string
): void {
  try {
    execFileSync(
      "git",
      ["-C", repositoryRoot, "worktree", "remove", "--force", workspaceRoot],
      { encoding: "utf8", stdio: "pipe" }
    );
  } catch (error) {
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

    throw new Error(`Failed to remove execution workspace: ${detail}`, {
      cause: error,
    });
  }
}
