import type { ExecutionFailure, ExecutionResult } from "./result.js";
export type ExecutionState = {
  evidence: ExecutionResult["evidence"];
  telemetry?: ExecutionResult["telemetry"];
  executionStartedAt?: number;
  failures: ExecutionFailure[];
  scope?: ExecutionResult["scope"];
};
