import type { ExecutionEvidence } from "@/services/evidence/index.js";
import type { ScopeCheckResult } from "@/services/scope/index.js";

export type ExecutionFailureStage =
  | "workspace"
  | "worker"
  | "evidence"
  | "scope"
  | "verification"
  | "cleanup"
  | "preservation"
  | "report";

export type ExecutionFailure = {
  stage: ExecutionFailureStage;
  message: string;
};

export type ExecutionTelemetry = {
  workspaceDurationMs?: number;
  workerDurationMs?: number;
  workerSetupDurationMs?: number;
  codexProcessDurationMs?: number;
  workerOutputProcessingDurationMs?: number;
  verificationDurationMs?: number;
  cleanupDurationMs?: number;
  totalDurationMs: number;
};

export type ExecutionResult = {
  passed: boolean;
  telemetry?: ExecutionTelemetry;
  evidence: ExecutionEvidence;
  scope?: ScopeCheckResult;
  failures: ExecutionFailure[];
  artifacts?: {
    directory: string;
    baseCommit?: string;
  };
  workspace?: { path: string };
  retainedWorkspace?: string;
};
