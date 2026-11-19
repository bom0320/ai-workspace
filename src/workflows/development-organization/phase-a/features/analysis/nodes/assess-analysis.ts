import {
  assessAnalysis,
  type AssessmentAgent,
} from "@/application/analysis-assessment/index.js";
import type { PhaseAState } from "../../../state.js";
import { assertCurrentAnalysis } from "@/application/governance/authorization/features/specialist-invocation/flow/prepare-analysis-refinement.js";

export function assessmentBasis(state: PhaseAState) {
  const {
    specialistDecisionsResult,
    decisionComparisonResult,
    specialistComparisonContext,
    synthesisAssignments,
  } = state;
  if (
    specialistDecisionsResult?.status !== "completed" ||
    !decisionComparisonResult ||
    decisionComparisonResult.status === "failed" ||
    !specialistComparisonContext ||
    !synthesisAssignments
  )
    throw new Error("Assessment requires completed analysis.");
  return {
    ...specialistComparisonContext,
    assignments: synthesisAssignments,
    decisions: specialistDecisionsResult.decisions,
    comparison: decisionComparisonResult,
  };
}

export function createAssessAnalysisNode(agent?: AssessmentAgent) {
  return async (state: PhaseAState): Promise<Partial<PhaseAState>> => {
    try {
      const basis = assessmentBasis(state);
      if (state.approvalResult?.status !== "approved")
        throw new Error("Missing initial Scope.");
      const limits = assertCurrentAnalysis(
        state.approvalResult.scope.id,
        basis,
        (state.analysisRepresentatives ?? []).map(
          ({ invocationId }) => invocationId
        )
      );
      return {
        analysisAssessment: await assessAnalysis(basis, limits, agent),
        analysisRefinement: undefined,
      };
    } catch {
      return {
        analysisAssessment: {
          status: "blocked",
          reason: "Current analysis provenance could not be verified.",
        },
        analysisRefinement: undefined,
      };
    }
  };
}
