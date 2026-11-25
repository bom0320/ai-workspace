import type { WorkDecompositionInput } from "../../../data-flow/work-decomposition/input.js";
import type { HandoffOutput } from "../../../data-flow/handoff/output.js";
import {
  decomposeApprovedWork,
  type RunWorkDecompositionOptions,
} from "@/application/work-decomposition/index.js";
import type { PhaseBState } from "../../../state.js";
import { verifyPhaseBHandoff } from "@/application/governance/index.js";
import { registerWorkDecomposition } from "@/application/governance/records/work-decomposition-records.js";
import { phaseBHandoffSchema } from "../../../data-flow/handoff/input.js";

export function createRunWorkDecompositionNode(
  options: RunWorkDecompositionOptions
) {
  return async ({ handoff }: PhaseBState): Promise<Partial<PhaseBState>> => {
    let handoffOutput: HandoffOutput;
    try {
      handoffOutput = {
        handoff,
        approved: verifyPhaseBHandoff(phaseBHandoffSchema.parse(handoff)),
      };
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
    const input: WorkDecompositionInput = {
      ...handoffOutput,
      executionDelegationGrant: handoff.executionDelegation.grant,
    };
    const workDecompositionResult = await decomposeApprovedWork(input, options);
    if (workDecompositionResult.status === "proposed")
      registerWorkDecomposition(workDecompositionResult);
    return {
      workDecompositionResult,
      handoffResult: {
        status: "accepted",
        approved: handoffOutput.approved,
      },
    };
  };
}
