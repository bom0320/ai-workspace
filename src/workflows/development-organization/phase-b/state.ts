import type { executeAssignmentPlan } from "./features/execution/coordination/execute-assignment-plan.js";
import type { prepareAssignmentPlan } from "@/application/planning/index.js";
import type {
  ExecutionResult,
  ReadOnlyExecutionResult,
} from "@/application/execution/index.js";
import { StateSchema } from "@langchain/langgraph";
import { z } from "zod";
import type { PlanningResult } from "@/application/planning/index.js";
import { workDecompositionResultSchema } from "@/application/work-decomposition/index.js";
import { phaseACompletedSchema } from "../contracts/phase-handoff.js";

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
  assignmentExecutionResult: z
    .custom<Awaited<ReturnType<typeof executeAssignmentPlan>>>()
    .optional(),
  assignmentPlanResult: z
    .custom<Awaited<ReturnType<typeof prepareAssignmentPlan>>>()
    .optional(),
  workDecompositionResult: workDecompositionResultSchema.optional(),
  executionPreparationResult: z
    .object({
      status: z.enum(["blocked", "denied", "approval-required"]),
      workItemId: z.string(),
      reason: z.string().min(1),
    })
    .strict()
    .optional(),
  workerExecutionResult: z
    .object({ workItemId: z.string(), result: z.custom<ExecutionResult>() })
    .strict()
    .optional(),
  readOnlyExecutionResult: z
    .object({
      workItemId: z.string(),
      result: z.custom<ReadOnlyExecutionResult>(),
    })
    .strict()
    .optional(),
  // Selection stays fixed while Detailed Planning consumes its queue.
  selectedWorkItemIds: z.array(z.string()).optional(),
  // A record of held work, with no automatic resumption.
  deferredDetailedPlanningIds: z.array(z.string()).optional(),
  pendingPlanningIds: z.array(z.string()).optional(),
  planningResults: z
    .array(
      z.object({
        workItemId: z.string(),
        executionBlockedReason: z.string().min(1).optional(),
        executionSourceId: z.string().optional(),
        // This value is produced by the internal Detailed Planning call only.
        result: z.custom<PlanningResult | { status: "read-only" }>(),
      })
    )
    .optional(),
});

export type PhaseBState = typeof phaseBState.State;
