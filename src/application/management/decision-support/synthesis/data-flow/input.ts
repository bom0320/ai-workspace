import type { CEOSynthesisDecision } from "../protocol/ceo.js";
import { z } from "zod";
import { staffingAssignmentSchema } from "@/application/management/allocation/analysis-assignment/index.js";
import { goalSpecSchema } from "@/contracts/goal.js";
import { agentDecisionSchema } from "@/application/specialist/analysis/index.js";
import { comparisonPayloadSchema } from "@/application/management/decision-support/comparison/index.js";
import {
  synthesisProposalSchema,
  synthesisTextSchema,
} from "../model/proposal.js";
export const synthesisContextSchema = z
  .object({
    revision: z
      .object({
        previousProposal: synthesisProposalSchema,
        feedback: synthesisTextSchema,
      })
      .strict()
      .optional(),
    goal: goalSpecSchema,
    repositoryCommitSha: synthesisTextSchema,
    assignments: z
      .array(
        staffingAssignmentSchema.pick({
          assignmentId: true,
          specialistId: true,
          objective: true,
        })
      )
      .min(1),
    decisions: z.array(agentDecisionSchema).min(1),
    comparison: z.discriminatedUnion("status", [
      z
        .object({
          status: z.literal("completed"),
          comparison: comparisonPayloadSchema,
        })
        .strict(),
      z
        .object({
          status: z.literal("skipped"),
          reason: z.literal("insufficient-decisions"),
        })
        .strict(),
    ]),
  })
  .strict();

export type SynthesisContext = z.infer<typeof synthesisContextSchema>;

export type CEOSynthesisAgent = (
  context: SynthesisContext
) => Promise<CEOSynthesisDecision>;

export type RunSynthesisOptions = {
  agent?: CEOSynthesisAgent;
  timeoutMs?: number;
};
