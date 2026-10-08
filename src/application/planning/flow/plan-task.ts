import type { GoalSpec } from "@/contracts/goal.js";
import { resolveRepositoryRoot } from "@/infrastructure/git/index.js";

import type { PlanningLimits } from "../model/limits.js";
import type { PlanningResult } from "../model/result.js";
import type { PlanningState } from "../model/state.js";
import { createCodexPlanner } from "../planner/codex-planner.js";
import { inspectRepository } from "./inspect-repository.js";
import { runPlanningLoop, type Planner } from "./planning-loop.js";

export type PlanTaskOptions = {
  goal: GoalSpec;
  repositoryPath: string;
  limits: PlanningLimits;
  planner?: Planner;
};

export async function planTask({
  goal,
  repositoryPath,
  limits,
  planner,
}: PlanTaskOptions): Promise<PlanningResult> {
  const repositoryRoot = resolveRepositoryRoot(repositoryPath);
  const repository = inspectRepository(repositoryRoot);
  const initialState: PlanningState = { goal, repository, inspectedFiles: [] };

  return runPlanningLoop({
    initialState,
    planner: planner ?? createCodexPlanner(),
    limits,
  });
}
