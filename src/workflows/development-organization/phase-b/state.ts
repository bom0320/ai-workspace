import type { HandoffOutput } from "@/application/data-flow/phase-b/handoff/output.js";
import type { AssignmentPlanningOutput } from "@/application/data-flow/phase-b/assignment-planning/output.js";
import type { AssignmentExecutionOutput } from "@/application/data-flow/phase-b/assignment-execution/output.js";
import { StateSchema } from "@langchain/langgraph";
import { z } from "zod";
import { workDecompositionResultSchema } from "@/application/work-decomposition/index.js";
import { phaseBHandoffSchema } from "@/application/data-flow/phase-b/handoff/input.js";

export const phaseBInput = new StateSchema({ handoff: phaseBHandoffSchema });

export const phaseBState = new StateSchema({
  ...phaseBInput.fields,
  handoffResult: z
    .discriminatedUnion("status", [
      z
        .object({
          status: z.literal("accepted"),
          approved: z.custom<HandoffOutput>(),
        })
        .strict(),
      z.object({ status: z.literal("denied"), reason: z.string() }).strict(),
    ])
    .optional(),
  assignmentExecutionResult: z.custom<AssignmentExecutionOutput>().optional(),
  assignmentPlanResult: z.custom<AssignmentPlanningOutput>().optional(),
  workDecompositionResult: workDecompositionResultSchema.optional(),
  selectedWorkItemIds: z.array(z.string()).optional(),
});

export type PhaseBState = typeof phaseBState.State;
