import { writeExecutionResult } from "../../services/artifacts/execution-artifacts.js";
import type { ExecutionResult } from "./execution-result.js";
import { addExecutionFailure } from "./execution-stages.js";
import type { ExecutionState } from "./execution-state.js";

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
