import type { AssignmentExecutionError } from "@/application/governance/index.js";

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
