import type { AssignmentReadSession } from "@/application/governance/index.js";
import type { GoalSpec } from "@/contracts/goal.js";
import type { PlanningLimits } from "../model/limits.js";
import type { DetailedPlanningInput } from "../model/state.js";
import type { Planner } from "../protocol/planner.js";

export type PlanTaskOptions = {
  goal: GoalSpec;
  repositoryPath: string;
  limits: PlanningLimits;
  planner?: Planner;
  detail?: DetailedPlanningInput;
};

export type AssignmentTaskDetailingInput = Pick<
  AssignmentReadSession,
  | "context"
  | "specialist"
  | "assignment"
  | "workItem"
  | "deadlineMs"
  | "inspect"
> & {
  executionBounds: ReturnType<AssignmentReadSession["checkWriteEligibility"]>;
  repositoryRoot: string;
  limits: PlanningLimits;
  assertEligible: () => void;
};
