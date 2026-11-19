import { z } from "zod";
import { executionDelegationRequestSchema } from "../../execution-delegation/model/execution-delegation.js";

const text = z.string().trim().min(1);
export const directionActionSchema = z.discriminatedUnion("action", [
  z
    .object({
      reviewId: text,
      binding: text,
      action: z.literal("approve"),
      executionDelegation: executionDelegationRequestSchema.optional(),
    })
    .strict(),
  z
    .object({ reviewId: text, binding: text, action: z.literal("reject") })
    .strict(),
  z
    .object({
      reviewId: text,
      binding: text,
      action: z.literal("request-revision"),
      feedback: text,
    })
    .strict(),
]);
export type DirectionAction = z.infer<typeof directionActionSchema>;
