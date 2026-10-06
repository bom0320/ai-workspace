import type { TaskContract } from "../../contracts/task.js";
import { checkScope } from "../../services/verification/scope-enforcement.js";
import { runVerification } from "../../services/verification/verification-runner.js";
import { runCodexWorker } from "../../services/worker/codex-worker.js";
import { collectChangedPaths } from "../../services/artifacts/execution-evidence.js";
import type {
  ExecutionFailureStage,
} from "./execution-result.js";
import type {
  ExecutionState,
  TaskExecutionOptions,
} from "./execution-state.js";

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
  options: TaskExecutionOptions
): Promise<boolean> {
  try {
    state.evidence.workerOutput = await runCodexWorker(
      task,
      workspaceRoot,
      options.workerTimeoutMs
    );

    return true;
  } catch (error) {
    addExecutionFailure(state, "worker", error);
    return false;
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
  options: TaskExecutionOptions
): Promise<void> {
  try {
    state.evidence.verification = await runVerification(
      task.verification,
      workspaceRoot,
      options.verificationTimeoutMs
    );
  } catch (error) {
    addExecutionFailure(state, "verification", error);
    return;
  }

  if (!state.evidence.verification.passed) {
    state.failures.push({
      stage: "verification",
      message: "Verification failed.",
    });
  }
}
