import type { AssignmentExecutionError } from "@/application/governance/index.js";

export type AssignmentExecutionOutput =
  | { status: "read-completed"; invocationId: string; resultDigest: string }
  | {
      status: "task-prepared";
      planFormat: "structured" | "legacy-steps";
      invocationId: string;
      resultDigest: string;
      taskContractBinding: string;
    }
  | {
      status: "write-completed";
      invocationId: string;
      resultDigest: string;
      specialistId: string;
      workItemId: string;
      assignmentId: string;
      taskContractBinding: string;
      artifacts: {
        directory: string;
        resultDigest: string;
        patchDigest?: string;
      };
    }
  | {
      status: "denied";
      failure: AssignmentExecutionError["failure"] | "runtime";
    }
  | {
      status: "failed";
      failure: AssignmentExecutionError["failure"];
      invocationId: string;
      failureRecorded: boolean;
      reason?: string;
      resultDigest?: string;
      artifacts?: {
        directory: string;
        resultDigest: string;
        patchDigest?: string;
      };
    };
