import type {
  AssignmentExecutionError,
  consumeAssignmentReadContext,
} from "@/application/governance/index.js";

// This session stays in the process that consumed the Claim.
export type AssignmentReadSession = ReturnType<
  typeof consumeAssignmentReadContext
>;

export type AssignmentReadOutput =
  | { status: "read-completed"; invocationId: string; resultDigest: string }
  | {
      status: "denied";
      failure: AssignmentExecutionError["failure"] | "runtime";
    }
  | {
      status: "failed";
      failure: AssignmentExecutionError["failure"];
      invocationId: string;
      failureRecorded: boolean;
    };

export type AssignmentExecutionStatus = "pending" | "denied" | "failed";

export type AssignmentExecutionOutput =
  | { status: "denied"; failure: "plan"; planId: string }
  | {
      status: AssignmentExecutionStatus;
      planId: string;
      results: (AssignmentReadOutput & {
        assignmentId: string;
        workItemId: string;
      })[];
      workItemResults: {
        workItemId: string;
        status: AssignmentExecutionStatus;
      }[];
      pendingAssignments: {
        assignmentId: string;
        workItemId: string;
        reason: "context-required" | "dependency-pending";
      }[];
    };
