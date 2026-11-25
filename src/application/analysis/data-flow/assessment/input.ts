import { z } from "zod";
import { synthesisContextSchema } from "@/application/synthesis/index.js";

export const assessmentInputSchema = synthesisContextSchema.omit({
  revision: true,
});
export type AssessmentInput = z.infer<typeof assessmentInputSchema>;

export const assessmentLimitsSchema = z
  .object({
    remainingInvocations: z.number().int().nonnegative(),
    remainingRefinements: z.number().int().nonnegative(),
  })
  .strict();
export type AssessmentLimits = z.infer<typeof assessmentLimitsSchema>;
