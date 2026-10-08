import { z } from "zod";

import type { InspectionRequest } from "./inspection.js";
import { taskContractDraftSchema } from "./task-draft.js";

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
