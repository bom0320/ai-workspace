import type {
  AssessmentInput,
  AssessmentResult,
} from "@/application/management/decision-support/analysis-review/index.js";

export type RefinementBasis = {
  context: AssessmentInput;
  invocationIds: string[];
  assessment: AssessmentResult;
};
