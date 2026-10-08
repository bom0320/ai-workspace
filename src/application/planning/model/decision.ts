import { z } from "zod";

import { taskContractSchema } from "@/contracts/task.js";

import type { InspectionRequest } from "./inspection.js";

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
    task: taskContractSchema,
  }),
]);

export type PlanningDecision = z.infer<typeof planningDecisionSchema>;
