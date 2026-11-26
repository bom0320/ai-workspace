import { z } from "zod";
import { sourceReferenceSchema } from "@/contracts/management/source-reference.js";

// Common Validation
export const synthesisTextSchema = z
  .string()
  .min(1)
  .refine((value) => value.trim().length > 0);

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
export type SynthesisProposal = z.infer<typeof synthesisProposalSchema>;
