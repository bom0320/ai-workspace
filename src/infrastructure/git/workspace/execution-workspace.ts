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

export function createExecutionWorkspace(
  repositoryRoot: string,
  baseCommit?: string
): string {
  if (
    baseCommit !== undefined &&
    !/^(?:[a-f0-9]{40}|[a-f0-9]{64})$/.test(baseCommit)
  )
    throw new Error("Execution Workspace requires a full commit ID.");

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
        baseCommit ?? "HEAD",
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
    if (baseCommit === undefined) {
      linkDependencies(repositoryRoot, workspacePath);
    } else {
      const actual = execFileSync(
        "git",
        ["-C", workspacePath, "rev-parse", "HEAD"],
        {
          encoding: "utf8",
          stdio: "pipe",
        }
      ).trim();
      if (actual !== baseCommit)
        throw new Error(
          "Execution Workspace does not match the approved commit."
        );
    }
  } catch (error) {
    const stage =
      baseCommit === undefined
        ? "link execution workspace dependencies"
        : "verify the approved Workspace commit";
    try {
      removeExecutionWorkspace(repositoryRoot, workspacePath);
    } catch (cleanupError) {
      throw new Error(
        `Failed to ${stage}; cleanup also failed at ${workspacePath}.`,
        {
          cause: new AggregateError([error, cleanupError]),
        }
      );
    }
    const detail = error instanceof Error ? error.message : String(error);
    throw new Error(`Failed to ${stage}: ${detail}`, { cause: error });
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
