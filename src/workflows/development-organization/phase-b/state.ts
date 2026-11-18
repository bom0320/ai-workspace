import { StateSchema } from "@langchain/langgraph";
import { z } from "zod";
import type { PlanningResult } from "@/application/planning/index.js";
import {
  workDecompositionInputSchema,
  workDecompositionResultSchema,
} from "@/application/work-decomposition/index.js";

export const phaseBInput = new StateSchema(workDecompositionInputSchema.shape);

export const phaseBState = new StateSchema({
  ...phaseBInput.fields,
  workDecompositionResult: workDecompositionResultSchema.optional(),
  pendingPlanningIds: z.array(z.string()).optional(),
  planningResults: z
    .array(
      z.object({
        workItemId: z.string(),
        // This value is produced by the internal Detailed Planning call only.
        result: z.custom<PlanningResult>(),
      })
    )
    .optional(),
});

export type PhaseBState = typeof phaseBState.State;
