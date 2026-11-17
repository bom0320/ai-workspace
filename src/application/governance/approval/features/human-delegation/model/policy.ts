import {
  contextAccessPolicySchema,
  pathScopeSchema,
} from "@/contracts/repository/context-access-policy.js";
import { z } from "zod";
import { humanConfirmationEvidenceSchema as confirmation } from "../../../shared/model/confirmation.js";
const text = z.string().min(1);
const date = z.iso.datetime();

// Human controls automatic Proposal approval, not Specialist execution authority.
export const humanDelegationPolicyInputSchema = z
  .object({
    allowedSpecialistIds: z.array(text).min(1),
    delegatedContextScopes: z.array(pathScopeSchema),
    maxAgentInvocations: z.number().int().positive(),
    expiresAt: date,
  })
  .strict();
export type HumanDelegationPolicyInput = z.infer<
  typeof humanDelegationPolicyInputSchema
>;

const recordFields = {
  id: text,
  version: z.number().int().positive(),
  repositoryRoot: text,
  systemPolicyVersion: z.number().int().positive(),
  status: z.enum(["active", "revoked", "superseded"]),
  approval: confirmation,
};
export const humanDelegationPolicySchema = humanDelegationPolicyInputSchema
  .extend(recordFields)
  .strict();
export type HumanDelegationPolicy = z.infer<typeof humanDelegationPolicySchema>;

// Read authenticated history without transforming its version, evidence or scope
// fields. Legacy input is deliberately NOT accepted by the configuration API.
const legacyDelegationPolicySchema = z
  .object({
    phase: z.literal("phase-a"),
    allowedSpecialistIds: z.array(text).min(1),
    allowedContextPaths: z.array(text).optional(),
    contextAccessPolicy: contextAccessPolicySchema.optional(),
    repositoryAccess: z.literal("read"),
    shellExecution: z.literal(false),
    maxAgentInvocations: z.number().int().positive(),
    expiresAt: date,
  })
  .extend(recordFields)
  .strict()
  .refine(
    (record) =>
      record.allowedContextPaths !== undefined ||
      record.contextAccessPolicy !== undefined,
    "Missing legacy delegation Context scope."
  );
export const recordedHumanDelegationPolicySchema = z.union([
  humanDelegationPolicySchema,
  legacyDelegationPolicySchema,
]);
export type RecordedHumanDelegationPolicy = z.infer<
  typeof recordedHumanDelegationPolicySchema
>;
