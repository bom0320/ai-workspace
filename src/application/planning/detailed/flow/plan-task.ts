import { randomUUID } from "node:crypto";

import type { GoalSpec } from "@/contracts/goal.js";
import { resolveRepositoryRoot } from "@/infrastructure/git/index.js";

import type { PlanningLimits } from "../model/limits.js";
import type { PlanningResult } from "../model/result.js";
import {
  detailedPlanningInputSchema,
  type DetailedPlanningInput,
  type PlanningState,
} from "../model/state.js";
import { createCodexPlanner } from "../planner/codex-planner.js";
import { inspectRepository } from "./inspection/inspect-repository.js";
import { inspectInitialFiles } from "./inspection/inspect-initial-files.js";
import { runPlanningLoop } from "./orchestration/planning-loop.js";
import type { Planner } from "../protocol/planner.js";
import { createFastPathTaskDraft } from "./adaptive/create-fast-path-task-draft.js";
import { buildTaskContract } from "./transformation/build-task-contract.js";

export type PlanTaskOptions = {
  goal: GoalSpec;
  repositoryPath: string;
  limits: PlanningLimits;
  planner?: Planner;
  detail?: DetailedPlanningInput;
};

export async function planTask({
  goal,
  repositoryPath,
  limits,
  planner,
  detail: requestedDetail,
}: PlanTaskOptions): Promise<PlanningResult> {
  const detail =
    requestedDetail === undefined
      ? undefined
      : detailedPlanningInputSchema.parse(requestedDetail);
  const goalId = `goal-${randomUUID()}`;
  const taskId = `task-${randomUUID()}`;
  const repositoryRoot = resolveRepositoryRoot(repositoryPath);
  const repository = inspectRepository(repositoryRoot);
  const initialState: PlanningState = {
    goal,
    ...(detail && { detail }),
    repository,
    inspectedFiles: inspectInitialFiles(
      repository,
      detail ? `${detail.objective}\n${detail.deliverable}` : goal.objective,
      limits
    ),
  };

  const fastPathDraft = createFastPathTaskDraft(initialState);
  if (fastPathDraft) {
    const task = buildTaskContract({
      draft: fastPathDraft,
      goal,
      goalId,
      taskId,
    });
    return { status: "completed", task, state: initialState, rounds: 0 };
  }

  return runPlanningLoop({
    initialState,
    planner: planner ?? createCodexPlanner(),
    limits,
    goalId,
    taskId,
  });
}
