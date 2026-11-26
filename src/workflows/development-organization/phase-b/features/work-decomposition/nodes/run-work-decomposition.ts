import { phaseBHandoffSchema } from "../../../../contracts/phase-handoff.js";
import {
  decomposeApprovedWork,
  type RunWorkDecompositionOptions,
} from "@/application/management/work-decomposition/index.js";
import type { PhaseBNodeInput, PhaseBNodeOutput } from "../../../data-flow.js";
import { verifyPhaseBHandoff } from "@/application/governance/index.js";
import { registerWorkDecomposition } from "@/application/governance/records/work-decomposition-records.js";

export function createRunWorkDecompositionNode(
  options: RunWorkDecompositionOptions
) {
  return async ({
    handoff,
  }: PhaseBNodeInput<"run-work-decomposition">): Promise<
    PhaseBNodeOutput<"run-work-decomposition">
  > => {
    let approved: ReturnType<typeof verifyPhaseBHandoff>;
    try {
      approved = verifyPhaseBHandoff(phaseBHandoffSchema.parse(handoff));
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
    const input = {
      handoff,
      approved,
      executionDelegationGrant: handoff.executionDelegation.grant,
    };
    const workDecompositionResult = await decomposeApprovedWork(input, options);
    if (workDecompositionResult.status === "proposed")
      registerWorkDecomposition(workDecompositionResult);
    return {
      workDecompositionResult,
      handoffResult: {
        status: "accepted",
        approved,
      },
    };
  };
}
