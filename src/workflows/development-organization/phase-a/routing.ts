import { END } from "@langchain/langgraph";
import type { PhaseAState } from "./state.js";

export type PhaseAExecutionTarget =
  | "staffing-approval"
  | "specialist-decisions"
  | "ceo-synthesis"
  | "human-direction-governance";

// Execution target selects an endpoint; State approval is not execution authority.
export function routeAfterStaffingApproval(
  state: PhaseAState,
  executionTarget: PhaseAExecutionTarget
) {
  return (executionTarget === "specialist-decisions" ||
    executionTarget === "ceo-synthesis" ||
    executionTarget === "human-direction-governance") &&
    state.approvalResult?.status === "approved"
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

export function routeAfterComparison(
  state: PhaseAState,
  executionTarget: PhaseAExecutionTarget
) {
  return (executionTarget === "ceo-synthesis" ||
    executionTarget === "human-direction-governance") &&
    state.specialistDecisionsResult?.status === "completed" &&
    (state.decisionComparisonResult?.status === "completed" ||
      (state.decisionComparisonResult?.status === "skipped" &&
        state.specialistDecisionsResult.decisions.length === 1))
    ? "run-ceo-synthesis"
    : END;
}

export function routeAfterSynthesis(
  state: PhaseAState,
  executionTarget: PhaseAExecutionTarget
) {
  return executionTarget === "human-direction-governance" &&
    state.synthesisResult?.status === "proposed" &&
    state.directionReview &&
    !state.directionGovernanceResult
    ? "human-direction-review"
    : END;
}
