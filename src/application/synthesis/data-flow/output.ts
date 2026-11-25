import { z } from "zod";
import { synthesisEscalationSchema } from "../model/escalation.js";
import {
  synthesisProposalSchema,
  synthesisTextSchema,
} from "../model/proposal.js";

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
