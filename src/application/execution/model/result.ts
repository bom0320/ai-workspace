import type { AgentDecision } from "@/application/decision/index.js";
import type { RepositorySnapshot } from "@/contracts/repository/snapshot.js";
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

export type ExecutionOutcome =
  | { status: "executed"; workItemId: string; result: ExecutionResult }
  | {
      status: "blocked" | "approval-required" | "denied";
      workItemId?: string;
      reason: string;
    };

export type ReadOnlyExecutionResult =
  | { passed: true; decision: AgentDecision; snapshot: RepositorySnapshot }
  | { passed: false; failure: "execution" | "validation"; reason: string };

export type ReadOnlyExecutionOutcome =
  | { status: "executed"; workItemId: string; result: ReadOnlyExecutionResult }
  | Exclude<ExecutionOutcome, { status: "executed" }>;
