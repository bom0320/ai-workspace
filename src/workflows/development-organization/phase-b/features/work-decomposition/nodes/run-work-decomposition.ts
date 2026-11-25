import {
  decomposeApprovedWork,
  type RunWorkDecompositionOptions,
} from "@/application/work-decomposition/index.js";
import type { PhaseBState } from "../../../state.js";
import { verifyPhaseBHandoff } from "@/application/governance/index.js";
import { registerWorkDecomposition } from "@/application/governance/records/work-decomposition-records.js";
import { phaseBHandoffSchema } from "@/application/data-flow/phase-b/handoff/input.js";

export function createRunWorkDecompositionNode(
  options: RunWorkDecompositionOptions
) {
  return async ({ handoff }: PhaseBState): Promise<Partial<PhaseBState>> => {
    let verified: ReturnType<typeof verifyPhaseBHandoff>;
    try {
      verified = verifyPhaseBHandoff(phaseBHandoffSchema.parse(handoff));
    } catch {
      return {
        handoffResult: {
          status: "denied",
          reason:
            "Phase B requires a current joint Direction and Execution Delegation approval.",
        },
        workDecompositionResult: undefined,
      };
    }
    const workDecompositionResult = await decomposeApprovedWork(
      {
        handoff,
        approved: verified,
        executionDelegationGrant: handoff.executionDelegation.grant,
      },
      options
    );
    if (workDecompositionResult.status === "proposed")
      registerWorkDecomposition(workDecompositionResult);
    return {
      workDecompositionResult,
      handoffResult: {
        status: "accepted",
        approved: verified,
      },
    };
  };
}
