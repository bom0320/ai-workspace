import type { TaskContract } from "../contracts/task.js";
import {
  createExecutionWorkspace,
  removeExecutionWorkspace,
} from "../repository/execution-workspace.js";
import { checkScope } from "../verification/scope-enforcement.js";
import { runVerification } from "../verification/verification-runner.js";
import { runCodexWorker } from "../workers/codex-worker.js";
import {
  createExecutionRun,
  getExecutionBaseCommit,
  preserveExecutionChanges,
  writeExecutionResult,
} from "./execution-artifacts.js";
import { collectChangedPaths } from "./execution-evidence.js";
import type {
  ExecutionFailure,
  ExecutionFailureStage,
  ExecutionResult,
} from "./execution-result.js";

export type TaskExecutionOptions = {
  workerTimeoutMs?: number;
  verificationTimeoutMs?: number;
};

type ExecutionState = {
  evidence: ExecutionResult["evidence"];
  failures: ExecutionFailure[];
  scope?: ExecutionResult["scope"];
};

type CleanupResult = {
  retainedWorkspace?: string;
};

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function addFailure(
  state: ExecutionState,
  stage: ExecutionFailureStage,
  error: unknown
): void {
  state.failures.push({
    stage,
    message: errorMessage(error),
  });
}

function collectEvidence(
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
    addFailure(state, "evidence", error);
    return false;
  }
}

function checkExecutionScope(
  task: TaskContract,
  state: ExecutionState,
  workspaceRoot: string,
  baseCommit: string
): boolean {
  if (!collectEvidence(state, workspaceRoot, baseCommit)) {
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

async function runWorker(
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
    addFailure(state, "worker", error);
    return false;
  }
}

async function verifyTask(
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
    addFailure(state, "verification", error);
    return;
  }

  if (!state.evidence.verification.passed) {
    state.failures.push({
      stage: "verification",
      message: "Verification failed.",
    });
  }
}

function preserveAndCleanup(
  state: ExecutionState,
  repositoryRoot: string,
  workspaceRoot: string,
  runDirectory: string,
  baseCommit: string
): CleanupResult {
  let changesPreserved = false;
  let cleanupSucceeded = false;

  try {
    preserveExecutionChanges(workspaceRoot, runDirectory, baseCommit);

    changesPreserved = true;
  } catch (error) {
    addFailure(state, "preservation", error);
  }

  if (changesPreserved) {
    try {
      removeExecutionWorkspace(repositoryRoot, workspaceRoot);

      cleanupSucceeded = true;
    } catch (error) {
      addFailure(state, "cleanup", error);
    }
  }

  if (changesPreserved && cleanupSucceeded) {
    return {};
  }

  return {
    retainedWorkspace: workspaceRoot,
  };
}

function finishExecution(
  state: ExecutionState,
  artifacts: NonNullable<ExecutionResult["artifacts"]>,
  retainedWorkspace?: string
): ExecutionResult {
  const result: ExecutionResult = {
    passed: state.failures.length === 0,
    evidence: state.evidence,
    ...(state.scope === undefined ? {} : { scope: state.scope }),
    failures: state.failures,
    artifacts,
    ...(retainedWorkspace === undefined ? {} : { retainedWorkspace }),
  };

  try {
    writeExecutionResult(artifacts.directory, result);
  } catch (error) {
    addFailure(state, "report", error);
    result.passed = false;
  }

  return result;
}

export async function executeTask(
  task: TaskContract,
  repositoryRoot: string,
  options: TaskExecutionOptions = {}
): Promise<ExecutionResult> {
  const state: ExecutionState = {
    evidence: {},
    failures: [],
  };

  let runDirectory: string;

  try {
    runDirectory = createExecutionRun(task);
  } catch (error) {
    addFailure(state, "preservation", error);

    return {
      passed: false,
      evidence: state.evidence,
      failures: state.failures,
    };
  }

  const artifacts: NonNullable<ExecutionResult["artifacts"]> = {
    directory: runDirectory,
  };

  let workspaceRoot: string;

  try {
    workspaceRoot = createExecutionWorkspace(repositoryRoot);
  } catch (error) {
    addFailure(state, "workspace", error);

    return finishExecution(state, artifacts);
  }

  try {
    artifacts.baseCommit = getExecutionBaseCommit(workspaceRoot);
  } catch (error) {
    addFailure(state, "preservation", error);

    return finishExecution(state, artifacts, workspaceRoot);
  }

  const baseCommit = artifacts.baseCommit;

  const workerSucceeded = await runWorker(task, state, workspaceRoot, options);

  if (!workerSucceeded) {
    collectEvidence(state, workspaceRoot, baseCommit);
  } else {
    const scopePassed = checkExecutionScope(
      task,
      state,
      workspaceRoot,
      baseCommit
    );

    if (scopePassed) {
      await verifyTask(task, state, workspaceRoot, options);

      checkExecutionScope(task, state, workspaceRoot, baseCommit);
    }
  }

  const cleanup = preserveAndCleanup(
    state,
    repositoryRoot,
    workspaceRoot,
    runDirectory,
    baseCommit
  );

  return finishExecution(state, artifacts, cleanup.retainedWorkspace);
}
