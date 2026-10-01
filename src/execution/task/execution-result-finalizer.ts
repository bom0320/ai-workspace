import { writeExecutionResult } from "./execution-artifacts.js";
import type { ExecutionResult } from "./execution-result.js";
import {
  addExecutionFailure,
  type ExecutionState,
} from "./execution-stages.js";

export function finalizeExecutionResult(
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
    addExecutionFailure(state, "report", error);

    result.passed = false;
  }

  return result;
}
