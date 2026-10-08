import type { GoalSpec } from "@/contracts/goal.js";

import type { InspectedFile } from "../protocol/inspection.js";

export type RepositoryInfo = {
  repositoryRoot: string;
  repositoryName: string;
  fileTree: string[];
  packageScripts: Record<string, string>;
  instructions?: string;
};

export type PlanningState = {
  goal: GoalSpec;
  repository: RepositoryInfo;
  inspectedFiles: InspectedFile[];
};

