import type { ExecutionFailure, ExecutionResult } from "./execution-result.js";

export type TaskExecutionOptions = {
  workerTimeoutMs?: number;
  verificationTimeoutMs?: number;
};

export type ExecutionState = {
  evidence: ExecutionResult["evidence"];
  failures: ExecutionFailure[];
  scope?: ExecutionResult["scope"];
};
