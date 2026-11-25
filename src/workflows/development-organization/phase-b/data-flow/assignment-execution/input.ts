import type { AssignmentPlanningInput } from "../assignment-planning/input.js";
import type { AssignmentPlanningOutput } from "../assignment-planning/output.js";

export type AssignmentExecutionInput = Pick<
  AssignmentPlanningInput,
  "handoff" | "selectedWorkItemIds"
> & {
  plan: Extract<AssignmentPlanningOutput, { status: "prepared" }>["plan"];
};
