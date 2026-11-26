import type { AssignmentReadSession } from "@/application/governance/index.js";
import type { PlanningLimits } from "../model/limits.js";

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
