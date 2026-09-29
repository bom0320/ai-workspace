import { runCodexWorker } from "../workers/codex-worker.js";
import type { TaskContract } from "../contracts/task.js";
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

  try {
    workspaceRoot = createExecutionWorkspace(repositoryRoot);
  } catch (error) {
    failures.push({
      stage: "workspace",
      message: error instanceof Error ? error.message : String(error),
    });

    return { passed: false, evidence, failures };
  }

  try {
    scope = runTaskStages(task, workspaceRoot, evidence, failures);
  } finally {
    try {
      removeExecutionWorkspace(repositoryRoot, workspaceRoot);
    } catch (error) {
      failures.push({
        stage: "cleanup",
        message: error instanceof Error ? error.message : String(error),
      });
    }
  }

  return {
    passed: failures.length === 0,
    evidence,
    ...(scope === undefined ? {} : { scope }),
    failures,
  };
}
