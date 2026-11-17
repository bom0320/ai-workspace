import { z } from "zod";

import type {
  ComparisonRelation,
  ComparisonGapKind,
  ComparisonPosition,
  ComparisonFinding,
  ComparisonGap,
  ComparisonResult,
} from "../model/comparison.js";

const comparisonRelationSchema = z.enum([
  "agreement",
  "conflict",
  "trade-off",
]) satisfies z.ZodType<ComparisonRelation>;

const comparisonGapKindSchema = z.enum([
  "uncertainty",
  "limitation",
  "separate-concern",
]) satisfies z.ZodType<ComparisonGapKind>;

const comparisonPositionSchema = z
  .object({
    specialistId: z.string().min(1),
    statement: z.string().min(1),
    evidenceIndexes: z.array(z.number().int().nonnegative()),
  })
  .strict() satisfies z.ZodType<ComparisonPosition>;

const comparisonFindingSchema = z
  .object({
    concern: z.string().min(1),
    relation: comparisonRelationSchema,
    positions: z.array(comparisonPositionSchema),
    rationale: z.string().min(1),
  })
  .strict() satisfies z.ZodType<ComparisonFinding>;

const comparisonGapSchema = z
  .object({
    concern: z.string().min(1),
    kind: comparisonGapKindSchema,
    specialistIds: z.array(z.string().min(1)),
    reason: z.string().min(1),
  })
  .strict() satisfies z.ZodType<ComparisonGap>;

// Structural validation only; references to source Decisions remain unverified.
export const comparisonPayloadSchema = z
  .object({
    findings: z.array(comparisonFindingSchema),
    gaps: z.array(comparisonGapSchema),
  })
  .strict() satisfies z.ZodType<ComparisonResult>;

export type ComparisonPayload = z.infer<typeof comparisonPayloadSchema>;
