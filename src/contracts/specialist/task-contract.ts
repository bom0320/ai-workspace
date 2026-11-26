import { z } from "zod";
import { implementationPlanSchema } from "./implementation-plan.js";

const nonEmptyString = z.string().min(1);

// TaskContract schema is the runtime source of truth.
export const taskContractSchema = z.object({
  // Unique identifier for this task.
  id: nonEmptyString,

  // Parent goal this task was derived from.
  goalId: nonEmptyString,

  // Outcome the Specialist must achieve for this task.
  objective: nonEmptyString,

  implementationPlan: implementationPlanSchema.optional(),

  // Retained for historical contracts and their existing digests.
  implementationSteps: z
    .array(z.string().refine((step) => step.trim().length > 0))
    .min(1)
    .optional(),

  // Repository where the task will be executed.
  targetRepository: nonEmptyString,

  // File paths the Specialist may change.
  allowedPaths: z.array(nonEmptyString),

  // File paths the Specialist must not change.
  forbiddenPaths: z.array(nonEmptyString),

  // Behavioral and implementation limits the Worker must follow.
  constraints: z.array(nonEmptyString),

  // Conditions that define successful task completion.
  acceptanceCriteria: z.array(nonEmptyString),

  // Commands that verify whether the task succeeded.
  verification: z.array(nonEmptyString),
});

export type TaskContract = z.infer<typeof taskContractSchema>;
