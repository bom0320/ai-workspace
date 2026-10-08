import type { GoalSpec } from "@/contracts/goal.js";
import { taskContractSchema, type TaskContract } from "@/contracts/task.js";

import type { TaskDraft } from "../protocol/planner.js";

export function finalizeTaskContract({
  draft,
  goal,
  goalId,
  taskId,
}: {
  draft: TaskDraft;
  goal: GoalSpec;
  goalId: string;
  taskId: string;
}): TaskContract {
  return taskContractSchema.parse({
    ...draft,
    id: taskId,
    goalId,
    targetRepository: goal.targetRepository,
    constraints: [...new Set([...(goal.constraints ?? []), ...draft.constraints])],
  });
}
