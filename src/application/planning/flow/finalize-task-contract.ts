import type { GoalSpec } from "@/contracts/goal.js";
import { taskContractSchema, type TaskContract } from "@/contracts/task.js";

import type { TaskContractDraft } from "../model/task-draft.js";

export function finalizeTaskContract({
  draft,
  goal,
  goalId,
  taskId,
}: {
  draft: TaskContractDraft;
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
