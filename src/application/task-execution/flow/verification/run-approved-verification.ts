import { randomUUID } from "node:crypto";
import { rmSync } from "node:fs";
import { join } from "node:path";
import {
  assertGovernedGitConfiguration,
  stageWorkspaceSnapshot,
} from "@/infrastructure/git/index.js";
import type { TaskContract } from "@/contracts/specialist/task-contract.js";
import { runCommand } from "@/infrastructure/process/index.js";
import type { VerificationResult } from "@/services/verification/index.js";
import { addExecutionFailure, type ExecutionState } from "../../model/state.js";

export async function runApprovedVerification(
  task: TaskContract,
  state: ExecutionState,
  workspaceRoot: string,
  remaining: () => number,
  snapshot: { baseCommit: string; directory: string }
): Promise<void> {
  const startedAt = performance.now();
  try {
    const commands: VerificationResult["commands"] = [];
    for (const command of task.verification) {
      if (command !== "git diff --check")
        throw new Error("Unknown verification command.");
      const temporaryIndex = join(
        snapshot.directory,
        `verify-index-${randomUUID()}`
      );
      let output: Awaited<ReturnType<typeof runCommand>>;
      try {
        assertGovernedGitConfiguration(workspaceRoot, remaining(), "worktree");
        const env = stageWorkspaceSnapshot(
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
    state.evidence.verification = {
      commands,
      passed: commands.every((command) => command.passed),
    };
  } catch (error) {
    addExecutionFailure(state, "verification", error);
    return;
  } finally {
    if (state.telemetry)
      state.telemetry.verificationDurationMs = performance.now() - startedAt;
  }

  if (!state.evidence.verification.passed) {
    state.failures.push({
      stage: "verification",
      message: "Verification failed.",
    });
  }
}
