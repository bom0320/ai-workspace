import { validateAnalysisReferences } from "@/application/synthesis/index.js";
import { assessWithCodex } from "../ceo/assess-with-codex.js";
import {
  assessmentAgentInputSchema,
  assessmentResultSchema,
  type AssessmentInput,
  type AssessmentLimits,
  type AssessmentAgent,
  type AssessmentResult,
} from "../model/assessment.js";

export async function assessAnalysis(
  input: AssessmentInput,
  limits: AssessmentLimits,
  agent: AssessmentAgent = assessWithCodex
): Promise<AssessmentResult> {
  try {
    const basis = assessmentAgentInputSchema.parse({ ...input, limits });
    const result = assessmentResultSchema.parse(
      await agent(structuredClone(basis))
    );
    if (result.sources) validateAnalysisReferences(basis, result.sources);
    return result;
  } catch {
    return {
      status: "blocked",
      reason:
        "CEO assessment or its analysis references could not be verified.",
    };
  }
}
