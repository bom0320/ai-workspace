import type { GoalSpec } from "@/contracts/goal.js";

import type { RepositoryContext } from "./context.js";
import type { InspectedFile } from "./inspection.js";

export type PlanningState = {
  goal: GoalSpec;
  repository: RepositoryContext;
  inspectedFiles: InspectedFile[];
};
