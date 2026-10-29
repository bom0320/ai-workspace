import { z } from "zod";

const paths = z.array(z.string().min(1));
// Harness-authored, exact binding to an original Human constraint. No natural
// language interpretation is inferred by this schema or by the CEO.
export const staffingConstraintRuleSchema = z.discriminatedUnion("type", [
  z
    .object({
      type: z.literal("context-paths"),
      constraint: z.string().min(1),
      allowedContextPaths: paths,
    })
    .strict(),
  z
    .object({
      type: z.literal("specialists"),
      constraint: z.string().min(1),
      allowedSpecialistIds: z.array(z.string().min(1)),
    })
    .strict(),
  z
    .object({
      type: z.literal("invocation-budget"),
      constraint: z.string().min(1),
      maxAgentInvocations: z.number().int().positive(),
    })
    .strict(),
]);

export const staffingProposalPolicySchema = z
  .object({
    maxAgentInvocations: z.number().int().positive(),
    constraintRules: z.array(staffingConstraintRuleSchema),
  })
  .strict();

export type StaffingProposalPolicy = z.infer<
  typeof staffingProposalPolicySchema
>;
