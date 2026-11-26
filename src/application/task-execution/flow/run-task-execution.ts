import { takeAssignmentTaskExecution } from "@/application/governance/index.js";
import { mkdtempSync, statSync } from "node:fs";
import { join } from "node:path";
import {
  assertGovernedGitConfiguration,
  createExecutionWorkspace,
} from "@/infrastructure/git/index.js";
import {
  createExecutionRun,
  getExecutionBaseCommit,
  preserveExecutionChanges,
} from "@/services/artifacts/index.js";

import type { ExecutionResult } from "../model/result.js";
import { addExecutionFailure, type ExecutionState } from "../model/state.js";
import {
  checkExecutionScope,
  collectChangedPathsEvidence,
} from "./verification/check-execution-scope.js";
import { runApprovedVerification } from "./verification/run-approved-verification.js";
import { finalizeTaskExecutionResult } from "./finalization/finalize-task-execution-result.js";
import { runCodexWorkerStage } from "./implementation/run-codex-worker-stage.js";

// Internal pipeline. Only the execution use case supplies an authorized execution.
export async function runTaskExecution(
  permit: Parameters<typeof takeAssignmentTaskExecution>[0],
  temporaryRoot: string
): Promise<ExecutionResult> {
  const execution = takeAssignmentTaskExecution(permit);
  const { task, timeoutMs } = execution;
  const { repositoryRoot, commitSha } = execution.snapshot;
  const deadline = performance.now() + timeoutMs;
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

    return finalizeTaskExecutionResult(state, artifacts);
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

    return finalizeTaskExecutionResult(state, artifacts, workspaceRoot);
  }

  const baseCommit = artifacts.baseCommit;

  const workerSucceeded = await runCodexWorkerStage(
    task,
    state,
    workspaceRoot,
    remaining
  );

  try {
    assertGovernedGitConfiguration(workspaceRoot, remaining(), "worktree");
  } catch (error) {
    addExecutionFailure(state, "scope", error);
    return finalizeTaskExecutionResult(state, artifacts, workspaceRoot);
  }

  if (!workerSucceeded) {
    collectChangedPathsEvidence(state, workspaceRoot, baseCommit);
  } else if (checkExecutionScope(task, state, workspaceRoot, baseCommit)) {
    await runApprovedVerification(task, state, workspaceRoot, remaining, {
      baseCommit,
      directory: runDirectory,
    });

    checkExecutionScope(task, state, workspaceRoot, baseCommit);
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
    if (statSync(join(runDirectory, "changes.patch")).size === 0)
      throw new Error(
        "Assignment implementation produced no preserved changes."
      );
  } catch (error) {
    addExecutionFailure(state, "preservation", error);
  }

  return finalizeTaskExecutionResult(state, artifacts, workspaceRoot);
}
