import type { WorkItemResult } from "@/application/governance/index.js";
import type { IntegrationFailure } from "../../shared/integrate-patches.js";

export type { WorkItemResult };

export type AssignmentIntegrationOutput =
  | WorkItemResult
  | { status: "pending"; planId: string; workItemId: string }
  | {
      status: "failed";
      planId: string;
      workItemId: string;
      failure: IntegrationFailure;
    };
