import type { TaskContract } from "../../contracts/task.js";
import {
  createExecutionWorkspace,
  removeExecutionWorkspace,
} from "../../infrastructure/git/index.js";
import {
  createExecutionRun,
  getExecutionBaseCommit,
  preserveExecutionChanges,
} from "../../services/artifacts/index.js";
import { finalizeExecutionResult } from "./execution-result-finalizer.js";
import type { ExecutionResult } from "./execution-result.js";
import {
  addExecutionFailure,
  collectChangedPathsEvidence,
  runScopeStage,
  runVerificationStage,
  runWorkerStage,
} from "./execution-stages.js";
import type {
  ExecutionState,
  TaskExecutionOptions,
} from "./execution-state.js";

export type { TaskExecutionOptions } from "./execution-state.js";

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
    addExecutionFailure(state, "preservation", error);

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
    addExecutionFailure(state, "workspace", error);

    return finalizeExecutionResult(state, artifacts);
  }

  try {
    artifacts.baseCommit = getExecutionBaseCommit(workspaceRoot);
  } catch (error) {
    addExecutionFailure(state, "preservation", error);

    return finalizeExecutionResult(state, artifacts, workspaceRoot);
  }

  const baseCommit = artifacts.baseCommit;

  const workerSucceeded = await runWorkerStage(
    task,
    state,
    workspaceRoot,
    options
  );

  if (!workerSucceeded) {
    collectChangedPathsEvidence(state, workspaceRoot, baseCommit);
  } else if (runScopeStage(task, state, workspaceRoot, baseCommit)) {
    await runVerificationStage(task, state, workspaceRoot, options);

    runScopeStage(task, state, workspaceRoot, baseCommit);
  }

  let changesPreserved = false;
  let cleanupSucceeded = false;

  try {
    preserveExecutionChanges(workspaceRoot, runDirectory, baseCommit);

    changesPreserved = true;
  } catch (error) {
    addExecutionFailure(state, "preservation", error);
  }

  if (changesPreserved) {
    try {
      removeExecutionWorkspace(repositoryRoot, workspaceRoot);

      cleanupSucceeded = true;
    } catch (error) {
      addExecutionFailure(state, "cleanup", error);
    }
  }

  const retainedWorkspace =
    changesPreserved && cleanupSucceeded ? undefined : workspaceRoot;

  return finalizeExecutionResult(state, artifacts, retainedWorkspace);
}
