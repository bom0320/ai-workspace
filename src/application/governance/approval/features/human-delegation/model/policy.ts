import { z } from "zod";
import { specialistAuthoritySchema } from "@/contracts/specialist-authority.js";
import { humanConfirmationEvidenceSchema as confirmation } from "../../../shared/model/confirmation.js";
const text = z.string().min(1);
const date = z.iso.datetime();

export const humanDelegationPolicyInputSchema = specialistAuthoritySchema
  .extend({
    phase: z.literal("phase-a"),
    allowedSpecialistIds: z.array(text).min(1),
    allowedContextPaths: z.array(text),
    repositoryAccess: z.literal("read"),
    shellExecution: z.literal(false),
    maxAgentInvocations: z.number().int().positive(),
    expiresAt: date,
  })
  .strict();
export type HumanDelegationPolicyInput = z.infer<
  typeof humanDelegationPolicyInputSchema
>;

export const humanDelegationPolicySchema = humanDelegationPolicyInputSchema
  .extend({
    id: text,
    version: z.number().int().positive(),
    repositoryRoot: text,
    systemPolicyVersion: z.number().int().positive(),
    status: z.enum(["active", "revoked", "superseded"]),
    approval: confirmation,
  })
  .strict();
export type HumanDelegationPolicy = z.infer<typeof humanDelegationPolicySchema>;
