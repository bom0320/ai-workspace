import type { WorkItemIntegrationOutput } from "@/application/integration/work-item/index.js";
import type { AssignmentIntegrationOutput } from "@/application/integration/assignment/index.js";
import type { VerifiedPhaseBContext } from "@/application/governance/index.js";
import type { AssignmentPlanningOutput } from "@/application/management/allocation/execution-assignment/index.js";
import type { AssignmentExecutionOutput } from "./features/assignment-execution/coordination/coordinate-assignment-executions.js";
import { StateSchema } from "@langchain/langgraph";
import { z } from "zod";
import { workDecompositionResultSchema } from "@/application/management/work-decomposition/index.js";
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
  workItemResults: z.array(z.custom<AssignmentIntegrationOutput>()).optional(),
  finalResult: z.custom<WorkItemIntegrationOutput>().optional(),
  selectedWorkItemIds: z.array(z.string()).optional(),
});

export type PhaseBState = typeof phaseBState.State;
