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
      status: "denied";
      failure: AssignmentExecutionError["failure"] | "runtime";
    }
  | {
      status: "failed";
      failure: AssignmentExecutionError["failure"];
      invocationId: string;
      failureRecorded: boolean;
      reason?: string;
    };
