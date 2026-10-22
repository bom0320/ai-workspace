import { z } from "zod";

import { staffingDraftSchema } from "../protocol/ceo.js";

// A use-case outcome, never an approved StaffingProposal or execution authority.
export const staffingRunResultSchema = z.discriminatedUnion("status", [
  z
    .object({
      status: z.literal("proposed"),
      draft: staffingDraftSchema,
      rounds: z.number().int().nonnegative(),
    })
    .strict(),
  z
    .object({
      status: z.literal("escalated"),
      reason: z.string().min(1),
      questions: z.array(z.string().min(1)).min(1),
      rounds: z.number().int().nonnegative(),
    })
    .strict(),
  z
    .object({
      status: z.literal("failed"),
      failure: z.enum([
        "invalid-input",
        "discovery",
        "inspection",
        "agent-process",
        "timeout",
        "malformed-json",
        "schema-validation",
        "snapshot-drift",
        "round-limit",
      ]),
      reason: z.string().min(1),
      rounds: z.number().int().nonnegative(),
    })
    .strict(),
]);

export type StaffingRunResult = z.infer<typeof staffingRunResultSchema>;
