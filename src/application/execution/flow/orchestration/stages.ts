import type { TaskContract } from "@/contracts/task.js";
import { checkScope } from "@/services/scope/index.js";
import type { VerificationResult } from "@/services/verification/index.js";
import { runCommand } from "@/infrastructure/process/index.js";
import { collectChangedPaths } from "@/services/evidence/index.js";

import { runCodexWorker } from "../../worker/codex-worker.js";
import type { ExecutionFailureStage } from "../../model/result.js";
import type { ExecutionState } from "../../model/state.js";

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export function addExecutionFailure(
  state: ExecutionState,
  stage: ExecutionFailureStage,
  error: unknown
): void {
  state.failures.push({
    stage,
    message: errorMessage(error),
  });
}

export function collectChangedPathsEvidence(
  state: ExecutionState,
  workspaceRoot: string,
  baseCommit: string
): boolean {
  try {
    state.evidence.changedPaths = collectChangedPaths(
      workspaceRoot,
      baseCommit
    );

    return true;
  } catch (error) {
    addExecutionFailure(state, "evidence", error);
    return false;
  }
}

export async function runWorkerStage(
  task: TaskContract,
  state: ExecutionState,
  workspaceRoot: string,
  remaining: () => number
): Promise<boolean> {
  const startedAt = performance.now();
  try {
    state.evidence.workerOutput = await runCodexWorker(
      task,
      workspaceRoot,
      remaining(),
      state.telemetry
    );

    return true;
  } catch (error) {
    addExecutionFailure(state, "worker", error);
    return false;
  } finally {
    if (state.telemetry)
      state.telemetry.workerDurationMs = performance.now() - startedAt;
  }
}

export function runScopeStage(
  task: TaskContract,
  state: ExecutionState,
  workspaceRoot: string,
  baseCommit: string
): boolean {
  if (!collectChangedPathsEvidence(state, workspaceRoot, baseCommit)) {
    return false;
  }

  const scope = checkScope(
    state.evidence.changedPaths ?? [],
    task.allowedPaths,
    task.forbiddenPaths
  );

  state.scope = scope;

  if (scope.passed) {
    return true;
  }

  const alreadyRecorded = state.failures.some(
    (failure) => failure.stage === "scope"
  );

  if (!alreadyRecorded) {
    state.failures.push({
      stage: "scope",
      message: `Scope violations: ${scope.violations.join(", ")}`,
    });
  }

  return false;
}

export async function runVerificationStage(
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
