import type { TaskContract } from "@/contracts/task.js";
import {
  createExecutionWorkspace,
} from "@/infrastructure/git/index.js";
import {
  createExecutionRun,
  getExecutionBaseCommit,
  preserveExecutionChanges,
} from "@/services/artifacts/index.js";

import { finalizeExecutionResult } from "./orchestration/result-finalizer.js";
import type { ExecutionResult } from "../model/result.js";
import {
  addExecutionFailure,
  collectChangedPathsEvidence,
  runScopeStage,
  runVerificationStage,
  runWorkerStage,
} from "./orchestration/stages.js";
import type {
  ExecutionState,
  TaskExecutionOptions,
} from "../model/state.js";

export type { TaskExecutionOptions } from "../model/state.js";

export async function executeTask(
  task: TaskContract,
  repositoryRoot: string,
  options: TaskExecutionOptions = {}
): Promise<ExecutionResult> {
  const executionStartedAt = performance.now();
  const state: ExecutionState = {
    executionStartedAt,
    telemetry: { totalDurationMs: 0 },
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
      telemetry: { totalDurationMs: performance.now() - executionStartedAt },
      evidence: state.evidence,
      failures: state.failures,
    };
  }

  const artifacts: NonNullable<ExecutionResult["artifacts"]> = {
    directory: runDirectory,
  };

  let workspaceRoot: string;
  const workspaceStartedAt = performance.now();

  try {
    workspaceRoot = createExecutionWorkspace(repositoryRoot);
  } catch (error) {
    state.telemetry!.workspaceDurationMs = performance.now() - workspaceStartedAt;
    addExecutionFailure(state, "workspace", error);

    return finalizeExecutionResult(state, artifacts);
  }

  state.telemetry!.workspaceDurationMs = performance.now() - workspaceStartedAt;

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

  try {
    preserveExecutionChanges(workspaceRoot, runDirectory, baseCommit);
  } catch (error) {
    addExecutionFailure(state, "preservation", error);
  }

  return finalizeExecutionResult(state, artifacts, workspaceRoot);
}
