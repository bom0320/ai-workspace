import type { ExecutionEvidence } from "../../services/artifacts/execution-evidence.js";
import type { ScopeCheckResult } from "../../services/verification/scope-enforcement.js";

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

export type ExecutionResult = {
  passed: boolean;
  evidence: ExecutionEvidence;
  scope?: ScopeCheckResult;
  failures: ExecutionFailure[];
  artifacts?: {
    directory: string;
    baseCommit?: string;
  };
  retainedWorkspace?: string;
};
