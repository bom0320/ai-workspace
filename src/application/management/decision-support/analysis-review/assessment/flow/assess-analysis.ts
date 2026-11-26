import { validateAnalysisReferences } from "@/application/management/decision-support/synthesis/index.js";
import { assessWithCodex } from "../ceo/assess-with-codex.js";
import {
  assessmentAgentInputSchema,
  type AssessmentAgent,
} from "../protocol/assessment.js";
import {
  assessmentResultSchema,
  type AssessmentResult,
} from "../../data-flow/assessment/output.js";
import {
  type AssessmentInput,
  type AssessmentLimits,
} from "../../data-flow/assessment/input.js";

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
