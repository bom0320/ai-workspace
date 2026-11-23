import { z } from "zod";
import type { GoalSpec } from "@/contracts/goal.js";

import type { InspectedFile } from "../protocol/inspection.js";

export type RepositoryInfo = {
  repositoryRoot: string;
  repositoryName: string;
  fileTree: string[];
  packageScripts: Record<string, string>;
  instructions?: string;
};

const planningText = z.string().trim().min(1);
export const detailedPlanningInputSchema = z
  .object({
    objective: planningText,
    deliverable: planningText,
    direction: planningText,
    readOnly: z.literal(true).optional(),
    executionCeiling: planningText.optional(),
  })
  .strict();

export type DetailedPlanningInput = z.infer<typeof detailedPlanningInputSchema>;

export type PlanningState = {
  goal: GoalSpec;
  detail?: DetailedPlanningInput;
  repository: RepositoryInfo;
  inspectedFiles: InspectedFile[];
};
