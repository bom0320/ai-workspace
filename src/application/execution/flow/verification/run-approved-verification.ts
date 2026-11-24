import type { TaskContract } from "@/contracts/task.js";
import { runCommand } from "@/infrastructure/process/index.js";
import type { VerificationResult } from "@/services/verification/index.js";
import { addExecutionFailure, type ExecutionState } from "../../model/state.js";

export async function runApprovedVerification(
  task: TaskContract,
  state: ExecutionState,
  workspaceRoot: string,
  remaining: () => number
): Promise<void> {
  const startedAt = performance.now();
  try {
    const commands: VerificationResult["commands"] = [];
    for (const command of task.verification) {
      if (command !== "git diff --check")
        throw new Error("Unknown verification command.");
      const output = await runCommand(
        "git",
        ["diff", "--check", "--no-ext-diff", "--no-textconv"],
        {
          cwd: workspaceRoot,
          timeoutMs: remaining(),
          shell: false,
        }
      );
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
