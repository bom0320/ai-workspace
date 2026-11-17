import { z } from "zod";
import { staffingAssignmentSchema } from "@/application/staffing/index.js";
import { goalSpecSchema } from "@/contracts/goal.js";
import { agentDecisionSchema } from "@/application/decision/index.js";
import { comparisonPayloadSchema } from "@/application/comparison/index.js";

const text = z
  .string()
  .min(1)
  .refine((value) => value.trim().length > 0);
export const synthesisContextSchema = z
  .object({
    goal: goalSpecSchema,
    repositoryCommitSha: text,
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

// These are pointers into supplied data, never new Repository Evidence.
export const sourceReferenceSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("recommendation"), specialistId: text }).strict(),
  z
    .object({
      kind: z.enum(["evidence", "risk", "uncertainty"]),
      specialistId: text,
      index: z.number().int().nonnegative(),
    })
    .strict(),
  z
    .object({
      kind: z.enum(["finding", "gap"]),
      index: z.number().int().nonnegative(),
    })
    .strict(),
]);
const sources = z.array(sourceReferenceSchema).min(1);
const statement = z.object({ text, sources }).strict();
export const synthesisProposalSchema = z
  .object({
    direction: statement,
    rationale: statement,
    alternatives: z.array(
      z.object({ description: text, reasonNotChosen: text, sources }).strict()
    ),
    tradeoffs: z.array(statement),
    risks: z.array(statement),
    unresolvedIssues: z.array(statement),
    humanReviewItems: z.array(statement).min(1),
  })
  .strict();
export const ceoSynthesisDecisionSchema = z.discriminatedUnion("type", [
  z
    .object({ type: z.literal("propose"), proposal: synthesisProposalSchema })
    .strict(),
  z
    .object({
      type: z.literal("escalate"),
      reason: text,
      questions: z.array(text).min(1),
      sources,
    })
    .strict(),
]);
export const synthesisResultSchema = z.discriminatedUnion("status", [
  z
    .object({
      status: z.literal("proposed"),
      proposal: synthesisProposalSchema,
    })
    .strict(),
  z
    .object({
      status: z.literal("escalated"),
      reason: text,
      questions: z.array(text).min(1),
      sources,
    })
    .strict(),
  z
    .object({
      status: z.literal("failed"),
      failure: z.enum(["invalid-input", "agent-execution", "invalid-output"]),
      reason: text,
    })
    .strict(),
]);
export type SynthesisContext = z.infer<typeof synthesisContextSchema>;
export type SourceReference = z.infer<typeof sourceReferenceSchema>;
export type SynthesisProposal = z.infer<typeof synthesisProposalSchema>;
export type CEOSynthesisDecision = z.infer<typeof ceoSynthesisDecisionSchema>;
export type SynthesisResult = z.infer<typeof synthesisResultSchema>;
export type CEOSynthesisAgent = (
  context: SynthesisContext
) => Promise<CEOSynthesisDecision>;
