import { z } from "zod";

const nonEmptyString = z.string().min(1);
const positiveInteger = z.number().int().positive();

// 2. Invocation Request
// CEO selects an approved Assignment and Context subset.
// Specialist identity, objective, and authority cannot be overridden.

export const invokeSpecialistRequestSchema = z
  .object({
    scopeId: nonEmptyString,
    scopeVersion: positiveInteger,
    assignmentId: nonEmptyString,
    requestedContextPaths: z.array(nonEmptyString).min(1),
  })
  .strict();
export type InvokeSpecialistRequest = z.infer<
  typeof invokeSpecialistRequestSchema
>;
