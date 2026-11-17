import { z } from "zod";

export const synthesisTextSchema = z
  .string()
  .min(1)
  .refine((value) => value.trim().length > 0);

// These are pointers into supplied data, never new Repository Evidence.
export const sourceReferenceSchema = z.discriminatedUnion("kind", [
  z
    .object({
      kind: z.literal("recommendation"),
      specialistId: synthesisTextSchema,
    })
    .strict(),
  z
    .object({
      kind: z.enum(["evidence", "risk", "uncertainty"]),
      specialistId: synthesisTextSchema,
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
export const synthesisSourcesSchema = z.array(sourceReferenceSchema).min(1);
const text = synthesisTextSchema;
const sources = synthesisSourcesSchema;
const statement = z.object({ text, sources }).strict();
export const synthesisProposalSchema = z
  .object({
    direction: statement,
    rationale: z.array(statement).min(1),
    alternatives: z.array(
      z.object({ description: text, reasonNotChosen: text, sources }).strict()
    ),
    tradeoffs: z.array(
      z.object({ benefit: text, cost: text, reason: text, sources }).strict()
    ),
    risks: z.array(statement),
    unresolvedIssues: z.array(statement),
    humanReviewItems: z.array(statement).min(1),
  })
  .strict();
export type SourceReference = z.infer<typeof sourceReferenceSchema>;
export type SynthesisProposal = z.infer<typeof synthesisProposalSchema>;
