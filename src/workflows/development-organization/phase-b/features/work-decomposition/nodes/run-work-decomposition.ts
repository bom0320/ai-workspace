import {
  runWorkDecomposition,
  type RunWorkDecompositionOptions,
} from "@/application/work-decomposition/index.js";
import type { PhaseBState } from "../../../state.js";

export function createRunWorkDecompositionNode(
  options: RunWorkDecompositionOptions
) {
  return async ({ approvedDecisionId }: PhaseBState) => ({
    workDecompositionResult: await runWorkDecomposition(
      { approvedDecisionId },
      options
    ),
  });
}
