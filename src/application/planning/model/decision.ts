import { z } from "zod";

import { taskContractSchema } from "@/contracts/task.js";

export type InspectionRequest = {
  paths: string[];
};

export const taskContractDraftSchema = taskContractSchema.omit({
  id: true,
  goalId: true,
});

export type TaskContractDraft = z.infer<typeof taskContractDraftSchema>;

const inspectionRequestSchema = z.object({
  paths: z.array(z.string().min(1)),
}) satisfies z.ZodType<InspectionRequest>;

export const planningDecisionSchema = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("inspect"),
    request: inspectionRequestSchema,
  }),
  z.object({
    type: z.literal("complete"),
    task: taskContractDraftSchema,
  }),
]);

export type PlanningDecision = z.infer<typeof planningDecisionSchema>;
