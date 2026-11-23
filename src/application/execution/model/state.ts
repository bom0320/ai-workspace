import type {
  ExecutionFailure,
  ExecutionFailureStage,
  ExecutionResult,
} from "./result.js";
export type ExecutionState = {
  evidence: ExecutionResult["evidence"];
  telemetry?: ExecutionResult["telemetry"];
  executionStartedAt?: number;
  failures: ExecutionFailure[];
  scope?: ExecutionResult["scope"];
};

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export function addExecutionFailure(
  state: ExecutionState,
  stage: ExecutionFailureStage,
  error: unknown
): void {
  state.failures.push({
    stage,
    message: errorMessage(error),
  });
}
