import {
  runSynthesis,
  type RunSynthesisOptions,
} from "@/application/synthesis/index.js";
import type { PhaseAState } from "../../../state.js";

export function createRunCEOSynthesisNode(options: RunSynthesisOptions = {}) {
  return async (state: PhaseAState): Promise<Partial<PhaseAState>> => {
    // 1. Require Completed Decisions and a Successful Comparison Stage
    const decisions = state.specialistDecisionsResult;
    const comparison = state.decisionComparisonResult;
    if (
      decisions?.status !== "completed" ||
      !comparison ||
      comparison.status === "failed"
    )
      return {
        synthesisResult: {
          status: "failed",
          failure: "invalid-input",
          reason:
            "Synthesis requires completed Decisions and completed or legitimately skipped Comparison.",
        },
      };

    // 2. Synthesize the Stored Scope's Read-only Assignment Projection
    // No Scope, Receipt or Invocation authority is passed to the CEO.
    return {
      synthesisResult: await runSynthesis(
        {
          ...state.specialistComparisonContext,
          assignments: state.synthesisAssignments,
          decisions: decisions.decisions,
          comparison,
        },
        options
      ),
    };
  };
}
