import { z } from "zod";

const specialistIdSchema = z
  .string()
  .min(1)
  .refine((value) => value.trim().length > 0);

// These are pointers into supplied data, never new Repository Evidence.
const recommendationReferenceSchema = z
  .object({
    kind: z.literal("recommendation"),
    specialistId: specialistIdSchema,
  })
  .strict();
const decisionItemReferenceSchema = z
  .object({
    kind: z.enum(["evidence", "risk", "uncertainty"]),
    specialistId: specialistIdSchema,
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

export type SourceReference = z.infer<typeof sourceReferenceSchema>;
