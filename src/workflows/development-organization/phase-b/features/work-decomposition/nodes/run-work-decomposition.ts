import {
  runWorkDecomposition,
  type RunWorkDecompositionOptions,
} from "@/application/work-decomposition/index.js";
import type { PhaseBState } from "../../../state.js";
import { registerExecutionDecomposition } from "@/application/governance/authorization/features/work-item-execution/flow/register-work-item-execution-source.js";

export function createRunWorkDecompositionNode(
  options: RunWorkDecompositionOptions
) {
  return async ({ approvedDecisionId }: PhaseBState) => {
    const workDecompositionResult = await runWorkDecomposition(
      { approvedDecisionId },
      options
    );
    if (workDecompositionResult.status === "proposed")
      registerExecutionDecomposition(workDecompositionResult);
    return { workDecompositionResult };
  };
}
