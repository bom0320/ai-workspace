import type { getPreparedAssignmentPlan } from "@/application/governance/index.js";

export type AssignmentIntegrationInput = {
  handoff: Parameters<typeof getPreparedAssignmentPlan>[0];
  planId: string;
  workItemId: string;
};
