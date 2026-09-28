import { runCodexWorker } from "./codex-worker.js";
import type { TaskContract } from "./contracts/task.js";
import { collectChangedPaths } from "./execution-evidence.js";
import type {
  ExecutionFailure,
  ExecutionResult,
} from "./execution-result.js";
import {
  createExecutionWorkspace,
  removeExecutionWorkspace,
} from "./execution-workspace.js";
import { checkScope } from "./scope-enforcement.js";
import { runVerification } from "./verification-runner.js";

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
    try {
      evidence.workerOutput = runCodexWorker(task, workspaceRoot);
    } catch (error) {
      failures.push({
        stage: "worker",
        message: error instanceof Error ? error.message : String(error),
      });
    }

    if (failures.length === 0) {
      try {
        evidence.changedPaths = collectChangedPaths(workspaceRoot);
      } catch (error) {
        failures.push({
          stage: "evidence",
          message: error instanceof Error ? error.message : String(error),
        });
      }
    }

    if (failures.length === 0) {
      scope = checkScope(
        evidence.changedPaths ?? [],
        task.allowedPaths,
        task.forbiddenPaths,
      );

      if (!scope.passed) {
        failures.push({
          stage: "scope",
          message: `Scope violations: ${scope.violations.join(", ")}`,
        });
      }
    }

    if (failures.length === 0) {
      try {
        evidence.verification = runVerification(
          task.verification,
          workspaceRoot,
        );
      } catch (error) {
        failures.push({
          stage: "verification",
          message: error instanceof Error ? error.message : String(error),
        });
      }

      if (evidence.verification && !evidence.verification.passed) {
        failures.push({
          stage: "verification",
          message: "Verification failed.",
        });
      }
    }
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
