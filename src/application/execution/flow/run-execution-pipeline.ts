import { mkdtempSync } from "node:fs";
import { join } from "node:path";
import type { AuthorizedExecution } from "@/application/governance/index.js";
import { createExecutionWorkspace } from "@/infrastructure/git/index.js";
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
import type { ExecutionState } from "../model/state.js";

// Internal pipeline. Only the execution use case supplies an authorized execution.
export async function runExecutionPipeline(
  execution: AuthorizedExecution,
  temporaryRoot: string
): Promise<ExecutionResult> {
  const { task } = execution.request;
  const { repositoryRoot, commitSha } = execution.snapshot;
  const deadline = performance.now() + execution.request.timeoutMs;
  const expiresAt = Date.parse(execution.expiresAt);
  const remaining = () => {
    const ms = Math.floor(
      Math.min(deadline - performance.now(), expiresAt - Date.now())
    );
    if (ms < 1) throw new Error("Governed execution exceeded its time limit.");
    return ms;
  };

  const executionStartedAt = performance.now();
  const state: ExecutionState = {
    executionStartedAt,
    telemetry: { totalDurationMs: 0 },
    evidence: {},
    failures: [],
  };

  let runDirectory: string;

  try {
    runDirectory = createExecutionRun(
      task,
      mkdtempSync(join(temporaryRoot, "ai-workspace-governed-runs-"))
    );
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
    workspaceRoot = createExecutionWorkspace(
      repositoryRoot,
      commitSha,
      remaining()
    );
  } catch (error) {
    state.telemetry!.workspaceDurationMs =
      performance.now() - workspaceStartedAt;
    addExecutionFailure(state, "workspace", error);

    return finalizeExecutionResult(state, artifacts);
  }

  state.telemetry!.workspaceDurationMs = performance.now() - workspaceStartedAt;

  try {
    artifacts.baseCommit = getExecutionBaseCommit(workspaceRoot);
    if (commitSha !== artifacts.baseCommit)
      throw new Error(
        "Execution Workspace does not match the approved Snapshot."
      );
  } catch (error) {
    addExecutionFailure(state, "preservation", error);

    return finalizeExecutionResult(state, artifacts, workspaceRoot);
  }

  const baseCommit = artifacts.baseCommit;

  const workerSucceeded = await runWorkerStage(
    task,
    state,
    workspaceRoot,
    remaining
  );

  if (!workerSucceeded) {
    collectChangedPathsEvidence(state, workspaceRoot, baseCommit);
  } else if (runScopeStage(task, state, workspaceRoot, baseCommit)) {
    await runVerificationStage(task, state, workspaceRoot, remaining);

    runScopeStage(task, state, workspaceRoot, baseCommit);
  }

  if (state.failures.length === 0) {
    try {
      remaining();
    } catch (error) {
      addExecutionFailure(state, "verification", error);
    }
  }

  try {
    preserveExecutionChanges(workspaceRoot, runDirectory, baseCommit);
  } catch (error) {
    addExecutionFailure(state, "preservation", error);
  }

  return finalizeExecutionResult(state, artifacts, workspaceRoot);
}
