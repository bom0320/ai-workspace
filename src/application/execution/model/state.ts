import type { ExecutionFailure, ExecutionResult } from "./result.js";
import type { WorkerContext } from "./worker-context.js";

export type TaskExecutionOptions = {
  workerTimeoutMs?: number;
  verificationTimeoutMs?: number;
  workerContext?: WorkerContext;
};

export type ExecutionState = {
  evidence: ExecutionResult["evidence"];
  telemetry?: ExecutionResult["telemetry"];
  executionStartedAt?: number;
  failures: ExecutionFailure[];
  scope?: ExecutionResult["scope"];
};
