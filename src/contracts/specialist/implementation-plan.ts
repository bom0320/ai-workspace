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
