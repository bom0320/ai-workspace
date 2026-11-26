import type { PhaseANodeInput, PhaseANodeOutput } from "../../../data-flow.js";
import { compareDecisions } from "@/application/management/decision-support/comparison/index.js";

export async function compareSpecialistDecisions(
  state: PhaseANodeInput<"compare-specialist-decisions">
): Promise<PhaseANodeOutput<"compare-specialist-decisions">> {
  try {
    // 1. Require Completed Specialist Decisions
    const result = state.specialistDecisionsResult;
    if (result?.status !== "completed")
      throw new Error("Comparison requires completed Specialist Decisions.");

    // 2. Record Comparison Skipping for a Single Decision
    if (result.decisions.length === 1)
      return {
        decisionComparisonResult: {
          status: "skipped",
          reason: "insufficient-decisions",
        },
      };

    // 3. Compare the Complete Decision Batch
    // v3 owns Reference validation. A Comparison failure never invalidates Stage 3's Decisions.
    if (!state.specialistComparisonContext)
      throw new Error("Specialist Comparison context is unavailable.");
    const comparison = await compareDecisions({
      ...state.specialistComparisonContext,
      decisions: result.decisions,
    });
    return { decisionComparisonResult: { status: "completed", comparison } };
  } catch (error) {
    return {
      decisionComparisonResult: {
        status: "failed",
        reason:
          error instanceof Error
            ? error.message
            : "Decision Comparison failed.",
      },
    };
  }
}
