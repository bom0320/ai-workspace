import type { AssignmentExecutionRequest } from "@/application/governance/index.js";
import type { AssignmentPlanningInput } from "../assignment-planning/input.js";
import type { AssignmentPlanningOutput } from "../assignment-planning/output.js";

export type AssignmentExecutionInput = Pick<
  AssignmentPlanningInput,
  "handoff" | "selectedWorkItemIds"
> & {
  plan: Extract<AssignmentPlanningOutput, { status: "prepared" }>["plan"];
};

export type AssignmentReadInput = Pick<AssignmentExecutionInput, "handoff"> & {
  request: Extract<AssignmentExecutionRequest, { access: "read" }>;
};
