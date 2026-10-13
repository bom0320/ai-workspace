import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

export function getWorkspaceDiff(workspacePath: string, baseCommit: string): { content: string; truncated: boolean } {
  const directory = mkdtempSync(join(tmpdir(), "ai-workspace-review-"));
  const env = { ...process.env, GIT_INDEX_FILE: join(directory, "index") };
  const limit = 64 * 1024;
  const options = { cwd: workspacePath, env, stdio: "pipe" as const };
  try {
    execFileSync("git", ["read-tree", baseCommit], options);
    execFileSync("git", ["add", "-A", "--"], options);
    let output: Buffer;
    let truncated = false;
    try {
      output = execFileSync("git", ["diff", "--cached", "--binary", "--no-color", "--no-ext-diff", "--no-textconv", baseCommit, "--"], { ...options, maxBuffer: limit });
    } catch (error) {
      if (!(error instanceof Error) || !("code" in error) || error.code !== "ENOBUFS" || !("stdout" in error) || !Buffer.isBuffer(error.stdout)) throw error;
      output = error.stdout;
      truncated = true;
    }
    return { content: output.subarray(0, limit).toString("utf8"), truncated: truncated || output.length > limit };
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
}
