import type { registerAssignmentPlan } from "@/application/governance/index.js";

export type CreateAssignmentPlanInput = {
  handoff: Parameters<typeof registerAssignmentPlan>[0];
  proposal: Parameters<typeof registerAssignmentPlan>[1];
  selectedWorkItemIds: readonly string[];
};
