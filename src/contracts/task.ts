import { z } from "zod";

const nonEmptyString = z.string().min(1);

export const taskContractSchema = z.object({
  // Unique identifier for this task.
  id: nonEmptyString,

  // Parent goal this task was derived from.
  goalId: nonEmptyString,

  // Outcome the Worker must achieve for this task.
  objective: nonEmptyString,

  // Repository where the task will be executed.
  targetRepository: nonEmptyString,

  // File paths the Worker may change.
  allowedPaths: z.array(nonEmptyString),

  // File paths the Worker must not change.
  forbiddenPaths: z.array(nonEmptyString),

  // Behavioral and implementation limits the Worker must follow.
  constraints: z.array(nonEmptyString),

  // Conditions that define successful task completion.
  acceptanceCriteria: z.array(nonEmptyString),

  // Commands that verify whether the task succeeded.
  verification: z.array(nonEmptyString),
});

export type TaskContract = z.infer<typeof taskContractSchema>;
