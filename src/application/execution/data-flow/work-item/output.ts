import type {
  ExecutionResult,
  ReadOnlyExecutionResult,
} from "../../model/result.js";

export type ExecutionOutcome =
  | { status: "executed"; workItemId: string; result: ExecutionResult }
  | {
      status: "blocked" | "approval-required" | "denied";
      workItemId?: string;
      reason: string;
    };
export type ReadOnlyExecutionOutcome =
  | { status: "executed"; workItemId: string; result: ReadOnlyExecutionResult }
  | Exclude<ExecutionOutcome, { status: "executed" }>;
