import type { AssignmentReadOutput } from "@/application/execution/index.js";

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
