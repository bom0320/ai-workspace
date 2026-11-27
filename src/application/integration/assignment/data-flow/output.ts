import type { RepositorySnapshot } from "@/contracts/repository/snapshot.js";

type AssignmentResultReference = {
  assignmentId: string;
  invocationId: string;
  resultDigest: string;
} & (
  | { status: "read-completed" }
  | {
      status: "write-completed";
      taskContractBinding: string;
      artifacts: {
        directory: string;
        patchDigest: string;
        resultDigest: string;
      };
    }
);

export type WorkItemResult = {
  planId: string;
  workItemId: string;
  snapshot: RepositorySnapshot;
  assignmentResults: AssignmentResultReference[];
} & (
  | { status: "read-integrated" }
  | {
      status: "write-integrated";
      artifacts: {
        directory: string;
        patchDigest: string;
        resultDigest: string;
      };
    }
);

export type AssignmentIntegrationOutput =
  | WorkItemResult
  | { status: "pending"; planId: string; workItemId: string }
  | {
      status: "failed";
      planId: string;
      workItemId: string;
      failure:
        | "source"
        | "artifact"
        | "workspace"
        | "patch"
        | "scope"
        | "verification"
        | "preservation"
        | "cleanup";
    };
