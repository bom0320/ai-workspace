import {
  runWorkDecomposition,
  type RunWorkDecompositionOptions,
} from "@/application/work-decomposition/index.js";
import type { PhaseBState } from "../../../state.js";
import { verifyExecutionHandoff } from "@/application/governance/index.js";
import { registerExecutionDecomposition } from "@/application/governance/records/execution-decomposition.js";
import { phaseACompletedSchema } from "../../../../contracts/phase-handoff.js";

export function createRunWorkDecompositionNode(
  options: RunWorkDecompositionOptions
) {
  return async ({ handoff }: PhaseBState): Promise<Partial<PhaseBState>> => {
    let verified: ReturnType<typeof verifyExecutionHandoff>;
    try {
      verified = verifyExecutionHandoff(phaseACompletedSchema.parse(handoff));
    } catch {
      return {
        handoffResult: {
          status: "denied",
          reason:
            "Phase B requires a current joint Direction and Execution Delegation approval.",
        },
        workDecompositionResult: undefined,
        pendingPlanningIds: undefined,
        planningResults: undefined,
      };
    }
    const workDecompositionResult = await runWorkDecomposition(
      { approvedDecisionId: verified.decision.id },
      { ...options, executionCeiling: verified.executionDelegation.grant }
    );
    if (workDecompositionResult.status === "proposed")
      registerExecutionDecomposition(workDecompositionResult);
    return {
      workDecompositionResult,
      handoffResult: {
        status: "accepted",
        handoff: { status: "completed", ...verified },
      },
    };
  };
}
