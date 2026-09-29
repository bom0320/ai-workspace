import { runCodexWorker } from "../workers/codex-worker.js";
import type { TaskContract } from "../contracts/task.js";
import {
  createExecutionRun,
  getExecutionBaseCommit,
  preserveExecutionChanges,
  writeExecutionResult,
} from "./execution-artifacts.js";
import { collectChangedPaths } from "./execution-evidence.js";
import type {
  ExecutionFailure,
  ExecutionResult,
} from "./execution-result.js";
import {
  createExecutionWorkspace,
  removeExecutionWorkspace,
} from "../repository/execution-workspace.js";
import { checkScope } from "../verification/scope-enforcement.js";
import { runVerification } from "../verification/verification-runner.js";

function finishExecution(
  evidence: ExecutionResult["evidence"],
  scope: ExecutionResult["scope"],
  failures: ExecutionFailure[],
  artifacts: NonNullable<ExecutionResult["artifacts"]>,
  retainedWorkspace?: string,
): ExecutionResult {
  const result: ExecutionResult = {
    passed: failures.length === 0,
    evidence,
    ...(scope === undefined ? {} : { scope }),
    failures,
    artifacts,
    ...(retainedWorkspace === undefined ? {} : { retainedWorkspace }),
  };

  try {
    writeExecutionResult(artifacts.directory, result);
  } catch (error) {
    failures.push({
      stage: "report",
      message: error instanceof Error ? error.message : String(error),
    });
    result.passed = false;
  }

  return result;
}

function runTaskStages(
  task: TaskContract,
  workspaceRoot: string,
  evidence: ExecutionResult["evidence"],
  failures: ExecutionFailure[],
): ExecutionResult["scope"] {
  try {
    evidence.workerOutput = runCodexWorker(task, workspaceRoot);
  } catch (error) {
    failures.push({
      stage: "worker",
      message: error instanceof Error ? error.message : String(error),
    });
    return;
  }

  try {
    evidence.changedPaths = collectChangedPaths(workspaceRoot);
  } catch (error) {
    failures.push({
      stage: "evidence",
      message: error instanceof Error ? error.message : String(error),
    });
    return;
  }

  const scope = checkScope(
    evidence.changedPaths,
    task.allowedPaths,
    task.forbiddenPaths,
  );

  if (!scope.passed) {
    failures.push({
      stage: "scope",
      message: `Scope violations: ${scope.violations.join(", ")}`,
    });
    return scope;
  }

  try {
    evidence.verification = runVerification(task.verification, workspaceRoot);
  } catch (error) {
    failures.push({
      stage: "verification",
      message: error instanceof Error ? error.message : String(error),
    });
    return scope;
  }

  if (!evidence.verification.passed) {
    failures.push({
      stage: "verification",
      message: "Verification failed.",
    });
  }

  return scope;
}

export function executeTask(
  task: TaskContract,
  repositoryRoot: string,
): ExecutionResult {
  const evidence: ExecutionResult["evidence"] = {};
  const failures: ExecutionFailure[] = [];
  let scope: ExecutionResult["scope"];
  let workspaceRoot: string;
  let runDirectory: string;

  try {
    runDirectory = createExecutionRun(task);
  } catch (error) {
    failures.push({
      stage: "preservation",
      message: error instanceof Error ? error.message : String(error),
    });

    return { passed: false, evidence, failures };
  }

  const artifacts: NonNullable<ExecutionResult["artifacts"]> = {
    directory: runDirectory,
  };

  try {
    workspaceRoot = createExecutionWorkspace(repositoryRoot);
  } catch (error) {
    failures.push({
      stage: "workspace",
      message: error instanceof Error ? error.message : String(error),
    });

    return finishExecution(evidence, scope, failures, artifacts);
  }

  try {
    artifacts.baseCommit = getExecutionBaseCommit(workspaceRoot);
  } catch (error) {
    failures.push({
      stage: "preservation",
      message: error instanceof Error ? error.message : String(error),
    });

    return finishExecution(
      evidence,
      scope,
      failures,
      artifacts,
      workspaceRoot,
    );
  }

  let changesPreserved = false;

  try {
    scope = runTaskStages(task, workspaceRoot, evidence, failures);
  } finally {
    try {
      preserveExecutionChanges(
        workspaceRoot,
        runDirectory,
        artifacts.baseCommit,
      );
      changesPreserved = true;
    } catch (error) {
      failures.push({
        stage: "preservation",
        message: error instanceof Error ? error.message : String(error),
      });
    }

    if (changesPreserved) {
      try {
        removeExecutionWorkspace(repositoryRoot, workspaceRoot);
      } catch (error) {
        failures.push({
          stage: "cleanup",
          message: error instanceof Error ? error.message : String(error),
        });
      }
    }
  }

  return finishExecution(
    evidence,
    scope,
    failures,
    artifacts,
    changesPreserved ? undefined : workspaceRoot,
  );
}
