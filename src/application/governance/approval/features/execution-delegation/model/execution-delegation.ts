import { z } from "zod";
import { humanConfirmationEvidenceSchema } from "../../../shared/model/confirmation.js";
import {
  executionBoundsSchema,
  executionScopes,
  scopedExecutionBoundsSchema,
} from "../../system-policy/model/execution-system-policy.js";

const text = z.string().min(1);
const positive = z.number().int().positive();

const grantFields = { policyVersion: positive, expiresAt: z.iso.datetime() };
export const executionDelegationRequestSchema = z
  .union([
    executionBoundsSchema.extend(grantFields),
    scopedExecutionBoundsSchema.extend(grantFields),
  ])
  .refine((grant) => {
    const { readScopes, writeScopes } = executionScopes(grant);
    return (
      readScopes.length + writeScopes.length + grant.shellCommands.length > 0
    );
  }, "A delegation must specify at least one capability.");
export type ExecutionDelegationRequest = z.infer<
  typeof executionDelegationRequestSchema
>;

export const executionDelegationSchema = z
  .object({
    id: text,
    approvedDecisionId: text,
    repositoryRoot: text,
    grant: executionDelegationRequestSchema,
    status: z.enum(["active", "revoked", "superseded"]),
    approvalRecordId: text,
    approvalSource: z.literal("post-direction").optional(),
    confirmationBinding: text,
    approval: humanConfirmationEvidenceSchema,
    issuedAt: z.iso.datetime(),
  })
  .strict();
export type ExecutionDelegation = z.infer<typeof executionDelegationSchema>;
