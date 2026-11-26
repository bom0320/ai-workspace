import type { TaskContract } from "@/contracts/specialist/task-contract.js";
import { collectChangedPaths } from "@/services/evidence/index.js";
import { checkScope } from "@/services/scope/index.js";
import { addExecutionFailure, type ExecutionState } from "../../model/state.js";

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

export function checkExecutionScope(
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
