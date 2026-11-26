import { z } from "zod";
import { workItemsSchema } from "@/contracts/management/work-item.js";

const text = z.string().trim().min(1);

export const escalationSchema = z
  .object({ reason: text, questions: z.array(text).min(1) })
  .strict();

export const workDecompositionResultSchema = z.discriminatedUnion("status", [
  z
    .object({
      status: z.literal("proposed"),
      approvedDecisionId: text,
      workItems: workItemsSchema,
    })
    .strict(),
  escalationSchema.extend({ status: z.literal("escalated") }),
  z
    .object({
      status: z.literal("failed"),
      failure: z.enum([
        "invalid-input",
        "agent-execution",
        "timeout",
        "malformed-json",
        "invalid-output",
        "invalid-dependencies",
      ]),
      reason: text,
    })
    .strict(),
]);

export type WorkDecompositionResult = z.infer<
  typeof workDecompositionResultSchema
>;
