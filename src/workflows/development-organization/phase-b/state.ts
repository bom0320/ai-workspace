import type { coordinateAssignmentExecutions } from "./features/execution/coordination/coordinate-assignment-executions.js";
import type { createAssignmentPlan } from "@/application/planning/index.js";
import { StateSchema } from "@langchain/langgraph";
import { z } from "zod";
import { workDecompositionResultSchema } from "@/application/work-decomposition/index.js";
import { phaseBHandoffSchema } from "../contracts/phase-handoff.js";

export const phaseBInput = new StateSchema({ handoff: phaseBHandoffSchema });

export const phaseBState = new StateSchema({
  ...phaseBInput.fields,
  handoffResult: z
    .discriminatedUnion("status", [
      z
        .object({
          status: z.literal("accepted"),
          handoff: phaseBHandoffSchema,
        })
        .strict(),
      z.object({ status: z.literal("denied"), reason: z.string() }).strict(),
    ])
    .optional(),
  assignmentExecutionResult: z
    .custom<Awaited<ReturnType<typeof coordinateAssignmentExecutions>>>()
    .optional(),
  assignmentPlanResult: z
    .custom<Awaited<ReturnType<typeof createAssignmentPlan>>>()
    .optional(),
  workDecompositionResult: workDecompositionResultSchema.optional(),
  selectedWorkItemIds: z.array(z.string()).optional(),
});

export type PhaseBState = typeof phaseBState.State;
