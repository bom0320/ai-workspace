import type { getRecordedWorkItemIntegrations } from "@/application/governance/index.js";

export type WorkItemIntegrationInput = {
  handoff: Parameters<typeof getRecordedWorkItemIntegrations>[0];
  planId: string;
};
