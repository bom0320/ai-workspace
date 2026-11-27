import type { RepositorySnapshot } from "@/contracts/repository/snapshot.js";
import type { WorkItemResult } from "@/application/governance/index.js";
import type { IntegrationFailure } from "../../shared/integrate-patches.js";

export type WorkItemResultReference = {
  workItemId: string;
  status: WorkItemResult["status"];
  digest: string;
};

export type FinalResult = {
  planId: string;
  snapshot: RepositorySnapshot;
  workItemResults: WorkItemResultReference[];
} & (
  | { status: "read-integrated" }
  | {
      status: "write-integrated";
      artifacts: Extract<
        WorkItemResult,
        { status: "write-integrated" }
      >["artifacts"];
      changedPaths: string[];
    }
);

export type WorkItemIntegrationOutput =
  | FinalResult
  | { status: "pending"; planId: string; missingWorkItemIds: string[] }
  | { status: "failed"; planId: string; failure: IntegrationFailure };
