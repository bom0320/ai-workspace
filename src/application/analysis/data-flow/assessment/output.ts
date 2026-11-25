import { z } from "zod";
import { pathScopeSchema } from "@/contracts/repository/context-access-policy.js";
import { sourceReferenceSchema } from "@/application/synthesis/index.js";

const text = z.string().trim().min(1);
const sources = z.array(sourceReferenceSchema).min(1);
const changeSchema = z.discriminatedUnion("kind", [
  z
    .object({
      kind: z.literal("re-evaluation"),
      specialistId: text,
      objective: text.optional(),
      reason: text,
    })
    .strict(),
  z
    .object({
      kind: z.literal("context-extension"),
      specialistId: text,
      context: z.array(pathScopeSchema).min(1),
      reason: text,
    })
    .strict(),
  z
    .object({
      kind: z.literal("specialist-addition"),
      specialistId: text,
      objective: text,
      context: z.array(pathScopeSchema).min(1),
      reason: text,
    })
    .strict(),
]);
export const assessmentResultSchema = z.discriminatedUnion("status", [
  z.object({ status: z.literal("sufficient"), reason: text, sources }).strict(),
  z
    .object({
      status: z.literal("refinement-required"),
      reason: text,
      sources,
      changes: z.array(changeSchema).min(1),
    })
    .strict(),
  z
    .object({
      status: z.literal("blocked"),
      reason: text,
      questions: z.array(text).optional(),
      sources: sources.optional(),
    })
    .strict(),
]);
export type AssessmentResult = z.infer<typeof assessmentResultSchema>;
