import type { VerifiedPhaseBContext } from "@/application/governance/index.js";
import type { AssignmentPlanningOutput } from "@/application/planning/index.js";
import type { AssignmentExecutionOutput } from "./features/execution/coordination/coordinate-assignment-executions.js";
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
          approved: z.custom<VerifiedPhaseBContext>(),
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
