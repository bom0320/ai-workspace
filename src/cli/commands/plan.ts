import { basename, resolve } from "node:path";

import { planTask, type PlanningResult } from "@/application/planning/index.js";
import { goalSpecSchema } from "@/contracts/goal.js";

export function runPlanCommand(args: string[]): Promise<PlanningResult> {
  const [repositoryPath, objective] = args;
  if (!repositoryPath?.trim()) {
    throw new Error("Repository path is required.");
  }
  if (!objective?.trim()) {
    throw new Error("Objective is required.");
  }
  const goal = goalSpecSchema.parse({
    objective,
    targetRepository: basename(resolve(repositoryPath)),
  });
  return planTask({
    goal,
    repositoryPath,
    limits: { maxRounds: 4, maxFilesPerRequest: 5, maxTotalFiles: 12 },
  });
}
