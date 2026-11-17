import { z } from "zod";

// Common Validation
export const synthesisTextSchema = z
  .string()
  .min(1)
  .refine((value) => value.trim().length > 0);

// SourceReference Schemas
// These are pointers into supplied data, never new Repository Evidence.
const recommendationReferenceSchema = z
  .object({
    kind: z.literal("recommendation"),
    specialistId: synthesisTextSchema,
  })
  .strict();
const decisionItemReferenceSchema = z
  .object({
    kind: z.enum(["evidence", "risk", "uncertainty"]),
    specialistId: synthesisTextSchema,
    index: z.number().int().nonnegative(),
  })
  .strict();
const comparisonReferenceSchema = z
  .object({
    kind: z.enum(["finding", "gap"]),
    index: z.number().int().nonnegative(),
  })
  .strict();

export const sourceReferenceSchema = z.discriminatedUnion("kind", [
  recommendationReferenceSchema,
  decisionItemReferenceSchema,
  comparisonReferenceSchema,
]);
export const synthesisSourcesSchema = z.array(sourceReferenceSchema).min(1);

// Proposal Component Schemas
const sourcedStatementSchema = z
  .object({
    text: synthesisTextSchema,
    sources: synthesisSourcesSchema,
  })
  .strict();
const alternativeSchema = z
  .object({
    description: synthesisTextSchema,
    reasonNotChosen: synthesisTextSchema,
    sources: synthesisSourcesSchema,
  })
  .strict();
const tradeoffSchema = z
  .object({
    benefit: synthesisTextSchema,
    cost: synthesisTextSchema,
    reason: synthesisTextSchema,
    sources: synthesisSourcesSchema,
  })
  .strict();

// SynthesisProposal Schema
export const synthesisProposalSchema = z
  .object({
    direction: sourcedStatementSchema,
    rationale: z.array(sourcedStatementSchema).min(1),
    alternatives: z.array(alternativeSchema),
    tradeoffs: z.array(tradeoffSchema),
    risks: z.array(sourcedStatementSchema),
    unresolvedIssues: z.array(sourcedStatementSchema),
    humanReviewItems: z.array(sourcedStatementSchema).min(1),
  })
  .strict();

// Type Exports
export type SourceReference = z.infer<typeof sourceReferenceSchema>;
export type SynthesisProposal = z.infer<typeof synthesisProposalSchema>;
