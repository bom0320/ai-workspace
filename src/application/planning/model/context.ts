import type { GoalSpec } from "@/contracts/goal.js";

export type RepositoryContext = {
  repositoryRoot: string;
  repositoryName: string;
  fileTree: string[];
  packageScripts: Record<string, string>;
  instructions?: string;
};

export type InspectedFile = {
  path: string;
  content: string;
};

export type InspectionResult = {
  files: InspectedFile[];
};

export type PlanningState = {
  goal: GoalSpec;
  repository: RepositoryContext;
  inspectedFiles: InspectedFile[];
};

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
