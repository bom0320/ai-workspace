import type {
  AssessmentInput,
  AssessmentResult,
} from "@/application/analysis/index.js";

export type RefinementBasis = {
  context: AssessmentInput;
  invocationIds: string[];
  assessment: AssessmentResult;
};
