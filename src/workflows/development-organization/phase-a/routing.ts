import { END } from "@langchain/langgraph";
import type { PhaseAState } from "./state.js";

export function routeAfterStaffingApproval(state: PhaseAState) {
  return state.approvalResult?.status === "approved"
    ? "preflight-specialist-decisions"
    : END;
}

export function routeAfterSpecialistExecution(state: PhaseAState) {
  if (state.specialistDecisionsResult?.status === "failed") return END;
  if (state.specialistDecisionsResult?.status === "completed")
    return "compare-specialist-decisions";
  if (
    state.currentSpecialistIndex !== undefined &&
    state.currentSpecialistIndex > 0 &&
    state.currentSpecialistIndex <
      (state.preparedSpecialistRequests?.length ?? 0)
  )
    return "execute-next-specialist";
  return END;
}

export function routeAfterComparison(state: PhaseAState) {
  return state.specialistDecisionsResult?.status === "completed" &&
    (state.decisionComparisonResult?.status === "completed" ||
      (state.decisionComparisonResult?.status === "skipped" &&
        state.specialistDecisionsResult.decisions.length === 1))
    ? "assess-analysis"
    : END;
}

export function routeAfterSynthesis(
  state: PhaseAState,
  requireHandoff: boolean
) {
  return state.synthesisResult?.status === "proposed" &&
    state.directionReview &&
    (!requireHandoff || state.directionReview.executionDelegationProposal) &&
    !state.directionGovernanceResult
    ? "human-direction-review"
    : END;
}
