import { execFileSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { closeSync, openSync, rmSync } from "node:fs";
import { dirname, join } from "node:path";

// Distinguishes a finally-block failure so callers can preserve its precedence
// and original cause without assigning Artifact lifecycle meaning here.
export class WorkspacePatchCleanupError extends Error {
  constructor(cause: unknown) {
    super("Failed to clean up workspace patch resources.", { cause });
    this.name = "WorkspacePatchCleanupError";
  }
}

// Stream the full binary patch to the caller-selected file. Unlike review diff,
// this output must never be limited by an in-memory stdout buffer or truncated.
export function writeWorkspacePatch(
  workspaceRoot: string,
  baseCommit: string,
  patchPath: string,
  staged?: { remaining: () => number }
): void {
  const temporaryIndex = join(
    dirname(patchPath),
    `.patch-index-${randomUUID()}`
  );
  const gitEnvironment = { ...process.env, GIT_INDEX_FILE: temporaryIndex };
  let patchDescriptor: number | undefined;
  try {
    if (!staged)
      stageWorkspaceSnapshot(workspaceRoot, baseCommit, temporaryIndex);
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
        env: staged ? undefined : gitEnvironment,
        timeout: staged?.remaining(),
        stdio: ["ignore", patchDescriptor, "pipe"],
      }
    );
  } finally {
    try {
      if (patchDescriptor !== undefined) closeSync(patchDescriptor);
      rmSync(temporaryIndex, { force: true });
    } catch (error) {
      throw new WorkspacePatchCleanupError(error);
    }
  }
}

// Builds the base-to-working-files delta including staged and untracked files.
export function stageWorkspaceSnapshot(
  workspaceRoot: string,
  baseCommit: string,
  temporaryIndex: string,
  remaining?: () => number
) {
  const env = { ...process.env, GIT_INDEX_FILE: temporaryIndex };
  execFileSync("git", ["-C", workspaceRoot, "read-tree", baseCommit], {
    env,
    stdio: ["ignore", "pipe", "pipe"],
    timeout: remaining?.(),
  });
  execFileSync("git", ["-C", workspaceRoot, "add", "-A", "--"], {
    env,
    stdio: ["ignore", "pipe", "pipe"],
    timeout: remaining?.(),
  });
  return env;
}
