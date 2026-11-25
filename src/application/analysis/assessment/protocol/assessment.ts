import {
  assessmentInputSchema,
  assessmentLimitsSchema,
} from "../../data-flow/assessment/input.js";
import type { z } from "zod";

export const assessmentAgentInputSchema = assessmentInputSchema.extend({
  limits: assessmentLimitsSchema,
});
export type AssessmentAgentInput = z.infer<typeof assessmentAgentInputSchema>;
export type AssessmentAgent = (input: AssessmentAgentInput) => Promise<unknown>;
