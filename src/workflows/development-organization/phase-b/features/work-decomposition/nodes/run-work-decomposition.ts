import {
  runWorkDecomposition,
  type RunWorkDecompositionOptions,
} from "@/application/work-decomposition/index.js";
import type { PhaseBState } from "../../../state.js";
import { verifyExecutionHandoff } from "@/application/governance/index.js";
import { registerWorkDecomposition } from "@/application/governance/records/work-decomposition-records.js";
import { phaseBHandoffSchema } from "../../../../contracts/phase-handoff.js";

export function createRunWorkDecompositionNode(
  options: RunWorkDecompositionOptions
) {
  return async ({ handoff }: PhaseBState): Promise<Partial<PhaseBState>> => {
    let verified: ReturnType<typeof verifyExecutionHandoff>;
    try {
      verified = verifyExecutionHandoff(phaseBHandoffSchema.parse(handoff));
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
      {
        ...options,
        executionDelegationGrant: verified.executionDelegation.grant,
      }
    );
    if (workDecompositionResult.status === "proposed")
      registerWorkDecomposition(workDecompositionResult);
    return {
      workDecompositionResult,
      handoffResult: {
        status: "accepted",
        handoff: { status: "completed", ...verified },
      },
    };
  };
}
