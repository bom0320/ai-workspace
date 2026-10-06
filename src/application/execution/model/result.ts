import type { ExecutionEvidence } from "../../../services/evidence/index.js";
import type { ScopeCheckResult } from "../../../services/scope/index.js";

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
