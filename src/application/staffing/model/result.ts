import { z } from "zod";

import { staffingProposalSchema } from "./staffing.js";

// Proposed means structural/policy checks passed, not semantic compliance with
// all Human instructions, Human approval, or execution authority.
export const staffingRunResultSchema = z.discriminatedUnion("status", [
  z
    .object({
      status: z.literal("proposed"),
      proposal: staffingProposalSchema,
      rounds: z.number().int().positive(),
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
        "policy-validation",
      ]),
      reason: z.string().min(1),
      rounds: z.number().int().nonnegative(),
    })
    .strict(),
]);

export type StaffingRunResult = z.infer<typeof staffingRunResultSchema>;
