import { z } from "zod";

const paths = z.array(z.string().min(1));
// Harness-authored mechanical policies, independent of Human instructions.
// Parsing neither proves their trusted origin nor semantic constraint compliance.
export const staffingEnforcementRuleSchema = z.discriminatedUnion("type", [
  z
    .object({
      type: z.literal("context-paths"),
      allowedContextPaths: paths,
    })
    .strict(),
  z
    .object({
      type: z.literal("specialists"),
      allowedSpecialistIds: z.array(z.string().min(1)),
    })
    .strict(),
  z
    .object({
      type: z.literal("invocation-budget"),
      maxAgentInvocations: z.number().int().positive(),
    })
    .strict(),
]);

export const staffingProposalPolicySchema = z
  .object({
    maxAgentInvocations: z.number().int().positive(),
    enforcementRules: z.array(staffingEnforcementRuleSchema),
  })
  .strict();

export type StaffingProposalPolicy = z.infer<
  typeof staffingProposalPolicySchema
>;

export type StaffingEnforcementRule = z.infer<
  typeof staffingEnforcementRuleSchema
>;
