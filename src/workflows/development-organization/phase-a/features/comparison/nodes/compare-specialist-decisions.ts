import { compareDecisions } from "@/application/comparison/index.js";
import type { PhaseAState } from "../../../state.js";

export async function compareSpecialistDecisions(
  state: PhaseAState
): Promise<Partial<PhaseAState>> {
  // 1. Compare the Complete Decision Batch
  // Only the Edge's all-completed path reaches Comparison. v3 retains Evidence
  // Reference validation; preflight supplied the stored Scope's Goal and baseline.
  try {
    if (!state.specialistComparisonContext)
      throw new Error("Specialist Comparison context is unavailable.");
    const comparison = await compareDecisions({
      ...state.specialistComparisonContext,
      decisions: state.collectedDecisions ?? [],
    });
    return { specialistComparison: comparison };
  } catch (error) {
    return {
      collectedDecisions: [],
      specialistComparison: undefined,
      specialistDecisionsResult: {
        status: "failed",
        stage: "comparison",
        reason:
          error instanceof Error
            ? error.message
            : "Specialist Decision Workflow failed.",
      },
    };
  }
}
