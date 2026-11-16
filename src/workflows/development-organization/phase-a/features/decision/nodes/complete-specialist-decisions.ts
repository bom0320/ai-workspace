import type { PhaseAState } from "../../../state.js";

export function completeSpecialistDecisions(
  state: PhaseAState
): Partial<PhaseAState> {
  // 1. Require Every Prepared Assignment to Have a Validated Decision
  const decisions = state.collectedDecisions ?? [];
  if (
    decisions.length === 0 ||
    decisions.length !== state.preparedSpecialistRequests?.length ||
    state.currentSpecialistIndex !== decisions.length
  ) {
    return {
      collectedDecisions: [],
      specialistDecisionsResult: {
        status: "failed",
        stage: "decision",
        reason:
          "Specialist Decisions cannot complete before every prepared Assignment succeeds.",
      },
    };
  }

  // 2. Publish the Completed Specialist Stage Result
  // Comparison has its own outcome; this does not approve a direction or finish Phase A.
  return { specialistDecisionsResult: { status: "completed", decisions } };
}
