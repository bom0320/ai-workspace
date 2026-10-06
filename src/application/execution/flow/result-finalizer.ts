import { writeExecutionResult } from "../../../services/artifacts/index.js";
import type { ExecutionResult } from "../model/result.js";
import { addExecutionFailure } from "./stages.js";
import type { ExecutionState } from "../model/state.js";

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
