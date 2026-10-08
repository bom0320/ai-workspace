import type { GoalSpec } from "@/contracts/goal.js";

import type { InspectedFile } from "./inspection.js";

export type PlannerInput = {
  goal: GoalSpec;
  repository: {
    name: string;
    fileTree: string[];
    packageScripts: Record<string, string>;
    instructions?: string;
  };
  inspectedFiles: InspectedFile[];
};
