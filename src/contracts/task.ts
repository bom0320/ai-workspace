import { z } from "zod";

const nonEmptyString = z.string().min(1);

const meaningfulText = nonEmptyString.refine(
  (value) => value.trim().length > 0
);

export const implementationPlanSchema = z.strictObject({
  background: meaningfulText,
  currentState: meaningfulText,
  targetDesign: meaningfulText,
  steps: z
    .array(
      z.strictObject({
        title: meaningfulText,
        targetPaths: z
          .array(meaningfulText)
          .refine((paths) => new Set(paths).size === paths.length),
        instructions: z.array(meaningfulText).min(1),
      })
    )
    .min(1),
});

export type ImplementationPlan = z.infer<typeof implementationPlanSchema>;

export function implementationPlanMatchesPaths(
  plan: ImplementationPlan,
  allowedPaths: readonly string[]
): boolean {
  const targets = new Set(plan.steps.flatMap(({ targetPaths }) => targetPaths));
  const allowed = new Set(allowedPaths);
  return (
    targets.size > 0 &&
    allowed.size === allowedPaths.length &&
    targets.size === allowed.size &&
    [...targets].every((path) => allowed.has(path))
  );
}

// TaskContract schema is the runtime source of truth.
export const taskContractSchema = z.object({
  // Unique identifier for this task.
  id: nonEmptyString,

  // Parent goal this task was derived from.
  goalId: nonEmptyString,

  // Outcome the Worker must achieve for this task.
  objective: nonEmptyString,

  implementationPlan: implementationPlanSchema.optional(),

  // Retained for historical contracts and their existing digests.
  implementationSteps: z
    .array(z.string().refine((step) => step.trim().length > 0))
    .min(1)
    .optional(),

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
