import { z } from "zod";
import { agentDecisionSchema } from "@/application/decision/index.js";
import { executionBoundsSchema } from "../approval/features/system-policy/model/execution-system-policy.js";

const digest = z.string().regex(/^[a-f0-9]{64}$/);
const id = z.string().min(1);
export const assignmentExecutionRequestSchema = executionBoundsSchema
  .pick({ readPaths: true })
  .extend({
    planId: digest,
    assignmentId: id,
    timeoutMs: executionBoundsSchema.shape.budget.shape.maxTimeoutMs,
  })
  .strict()
  .refine(({ readPaths }) => readPaths.length > 0);

export const assignmentExecutionRecordSchema = z
  .object({
    id,
    delegationId: id,
    request: assignmentExecutionRequestSchema,
    binding: digest,
    reservedAt: z.iso.datetime(),
    claimedAt: z.iso.datetime().optional(),
    result: z
      .object({ decision: agentDecisionSchema, digest })
      .strict()
      .optional(),
  })
  .strict();
