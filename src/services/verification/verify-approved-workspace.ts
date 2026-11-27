import { randomUUID } from "node:crypto";
import { rmSync } from "node:fs";
import { join } from "node:path";
import {
  assertGovernedGitConfiguration,
  stageWorkspaceSnapshot,
} from "@/infrastructure/git/index.js";
import { runCommand } from "@/infrastructure/process/index.js";
import type { VerificationResult } from "./verification-runner.js";

export async function verifyApprovedWorkspace(
  verification: readonly string[],
  workspaceRoot: string,
  remaining: () => number,
  snapshot: { baseCommit: string; directory: string; staged?: true }
): Promise<VerificationResult> {
  const commands: VerificationResult["commands"] = [];
  for (const command of verification) {
    if (command !== "git diff --check")
      throw new Error("Unknown verification command.");
    const temporaryIndex = join(
      snapshot.directory,
      `verify-index-${randomUUID()}`
    );
    let output: Awaited<ReturnType<typeof runCommand>>;
    try {
      assertGovernedGitConfiguration(workspaceRoot, remaining(), "worktree");
      const env = snapshot.staged
        ? undefined
        : stageWorkspaceSnapshot(
            workspaceRoot,
            snapshot.baseCommit,
            temporaryIndex,
            remaining
          );
      output = await runCommand(
        "git",
        [
          "diff",
          "--check",
          "--no-ext-diff",
          "--no-textconv",
          "--cached",
          snapshot.baseCommit,
          "--",
        ],
        {
          cwd: workspaceRoot,
          timeoutMs: remaining(),
          shell: false,
          env,
        }
      );
    } finally {
      rmSync(temporaryIndex, { force: true });
    }
    commands.push({
      command,
      passed: output.exitCode === 0 && !output.timedOut && !output.error,
      exitCode: output.exitCode,
      stdout: output.stdout,
      stderr: output.stderr,
      timedOut: output.timedOut,
    });
  }
  remaining();
  return { commands, passed: commands.every((command) => command.passed) };
}
