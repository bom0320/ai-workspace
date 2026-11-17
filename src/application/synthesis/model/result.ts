import { z } from "zod";
import {
  synthesisProposalSchema,
  synthesisTextSchema,
  synthesisSourcesSchema,
} from "./proposal.js";

export const synthesisEscalationSchema = z
  .object({
    reason: synthesisTextSchema,
    questions: z.array(synthesisTextSchema).min(1),
    sources: synthesisSourcesSchema,
  })
  .strict();
export const synthesisResultSchema = z.discriminatedUnion("status", [
  z
    .object({
      status: z.literal("proposed"),
      proposal: synthesisProposalSchema,
    })
    .strict(),
  synthesisEscalationSchema.extend({ status: z.literal("escalated") }),
  z
    .object({
      status: z.literal("failed"),
      failure: z.enum([
        "invalid-input",
        "agent-execution",
        "timeout",
        "malformed-json",
        "invalid-output",
        "invalid-references",
        "incomplete-coverage",
      ]),
      reason: synthesisTextSchema,
    })
    .strict(),
]);
export type SynthesisResult = z.infer<typeof synthesisResultSchema>;
