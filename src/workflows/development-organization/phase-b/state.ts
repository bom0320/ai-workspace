import { StateSchema } from "@langchain/langgraph";
import {
  workDecompositionInputSchema,
  workDecompositionResultSchema,
} from "@/application/work-decomposition/index.js";

export const phaseBState = new StateSchema({
  ...workDecompositionInputSchema.shape,
  workDecompositionResult: workDecompositionResultSchema.optional(),
});

export type PhaseBState = typeof phaseBState.State;
