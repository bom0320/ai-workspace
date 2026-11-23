import { mkdtempSync } from "node:fs";
import { join } from "node:path";
import {
  authorizeExecutionForRun,
  executionRequestSchema,
} from "@/application/governance/index.js";
import { runCommand } from "@/infrastructure/process/index.js";
import type { VerificationResult } from "@/services/verification/index.js";
import { checkGovernedWorkerRuntime } from "../worker/check-governed-worker-runtime.js";
import { runGovernedWorker } from "../worker/governed-worker.js";
import type { TaskContract } from "@/contracts/task.js";
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
import type { ExecutionState, TaskExecutionOptions } from "../model/state.js";

export type { TaskExecutionOptions } from "../model/state.js";

export async function executeTask(
  task: TaskContract,
  repositoryRoot: string,
  options: TaskExecutionOptions = {}
): Promise<ExecutionResult> {
  return executeTaskPipeline(task, repositoryRoot, options);
}

export async function executeGovernedTask(input: unknown) {
  const parsed = executionRequestSchema.safeParse(input);
  if (!parsed.success)
    return { status: "denied" as const, reason: "Invalid execution request." };
  const runtime = checkGovernedWorkerRuntime(parsed.data);
  if (runtime.status === "blocked") return runtime;
  const authorization = authorizeExecutionForRun(parsed.data);
  if (authorization.status !== "authorized") return authorization;
  const execution = authorization.execution;
  const deadline = performance.now() + execution.request.timeoutMs;
  const expiresAt = Date.parse(execution.expiresAt);
  const remaining = () => {
    const ms = Math.floor(
      Math.min(deadline - performance.now(), expiresAt - Date.now())
    );
    if (ms < 1) throw new Error("Governed execution exceeded its time limit.");
    return ms;
  };

  const result = await executeTaskPipeline(
    execution.request.task,
    execution.snapshot.repositoryRoot,
    {},
    {
      baseCommit: execution.snapshot.commitSha,
      temporaryRoot: runtime.temporaryRoot,
      worker: (workspace) =>
        runGovernedWorker(execution, workspace, runtime.apiKey, remaining),
      verify: async (workspace) => {
        const commands = [];
        for (const command of execution.request.task.verification) {
          if (command !== "git diff --check")
            throw new Error("Unknown verification command.");
          const output = await runCommand(
            "git",
            ["diff", "--check", "--no-ext-diff", "--no-textconv"],
            {
              cwd: workspace,
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
        return {
          commands,
          passed: commands.every((command) => command.passed),
        };
      },
      remaining,
    }
  );
  return { status: "executed" as const, result };
}

type GovernedPipeline = {
  baseCommit: string;
  temporaryRoot: string;
  worker: (workspace: string) => Promise<string>;
  verify: (workspace: string) => Promise<VerificationResult>;
  remaining: () => number;
};

async function executeTaskPipeline(
  task: TaskContract,
  repositoryRoot: string,
  options: TaskExecutionOptions,
  governed?: GovernedPipeline
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
    runDirectory = governed
      ? createExecutionRun(
          task,
          mkdtempSync(
            join(governed.temporaryRoot, "ai-workspace-governed-runs-")
          )
        )
      : createExecutionRun(task);
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
    workspaceRoot = governed
      ? createExecutionWorkspace(
          repositoryRoot,
          governed.baseCommit,
          governed.remaining()
        )
      : createExecutionWorkspace(repositoryRoot);
  } catch (error) {
    state.telemetry!.workspaceDurationMs =
      performance.now() - workspaceStartedAt;
    addExecutionFailure(state, "workspace", error);

    return finalizeExecutionResult(state, artifacts);
  }

  state.telemetry!.workspaceDurationMs = performance.now() - workspaceStartedAt;

  try {
    artifacts.baseCommit = getExecutionBaseCommit(workspaceRoot);
    if (governed && governed.baseCommit !== artifacts.baseCommit)
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
    options,
    governed?.worker
  );

  if (!workerSucceeded) {
    collectChangedPathsEvidence(state, workspaceRoot, baseCommit);
  } else if (runScopeStage(task, state, workspaceRoot, baseCommit)) {
    await runVerificationStage(
      task,
      state,
      workspaceRoot,
      options,
      governed?.verify
    );

    runScopeStage(task, state, workspaceRoot, baseCommit);
  }

  if (governed && state.failures.length === 0) {
    try {
      governed.remaining();
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
