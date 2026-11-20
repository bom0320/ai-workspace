import { StateSchema } from "@langchain/langgraph";
import { z } from "zod";
import type { PlanningResult } from "@/application/planning/index.js";
import { workDecompositionResultSchema } from "@/application/work-decomposition/index.js";
import { phaseACompletedSchema } from "../execution-handoff.js";

export const phaseBInput = new StateSchema({ handoff: phaseACompletedSchema });

export const phaseBState = new StateSchema({
  ...phaseBInput.fields,
  handoffResult: z
    .discriminatedUnion("status", [
      z
        .object({
          status: z.literal("accepted"),
          handoff: phaseACompletedSchema,
        })
        .strict(),
      z.object({ status: z.literal("denied"), reason: z.string() }).strict(),
    ])
    .optional(),
  workDecompositionResult: workDecompositionResultSchema.optional(),
  pendingPlanningIds: z.array(z.string()).optional(),
  planningResults: z
    .array(
      z.object({
        workItemId: z.string(),
        executionSourceId: z.string().optional(),
        // This value is produced by the internal Detailed Planning call only.
        result: z.custom<PlanningResult>(),
      })
    )
    .optional(),
});

export type PhaseBState = typeof phaseBState.State;
