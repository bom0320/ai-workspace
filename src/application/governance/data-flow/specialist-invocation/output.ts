import { z } from "zod";
import { authorizedSpecialistInvocationSchema } from "../../model/authority.js";

const nonEmptyString = z.string().min(1);

// 5. Authorization Verdict
// Represents the Harness authorization result.
// Only an allowed verdict contains an Authorized Invocation.

export const authorityVerdictSchema = z.discriminatedUnion("status", [
  z
    .object({
      status: z.literal("allowed"),
      invocation: authorizedSpecialistInvocationSchema,
    })
    .strict(),
  z
    .object({
      status: z.literal("approval-required"),
      reason: nonEmptyString,
    })
    .strict(),
  z
    .object({
      status: z.literal("denied"),
      reason: nonEmptyString,
    })
    .strict(),
]);
export type AuthorityVerdict = z.infer<typeof authorityVerdictSchema>;
