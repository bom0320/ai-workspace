import type { PhaseAState } from "../../state.js";

export function completeSpecialistDecisions(
  state: PhaseAState
): Partial<PhaseAState> {
  // 1. Publish the Completed Specialist Stage Result
  // This is neither Human direction approval nor the final Phase A Outcome.
  return {
    specialistDecisionsResult: {
      status: "completed",
      decisions: state.collectedDecisions ?? [],
      ...(state.specialistComparison
        ? { comparison: state.specialistComparison }
        : {}),
    },
  };
}
