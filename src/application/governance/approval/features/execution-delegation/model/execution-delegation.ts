import { z } from "zod";
import { humanConfirmationEvidenceSchema } from "../../../shared/model/confirmation.js";
import { executionBoundsSchema } from "../../system-policy/model/execution-system-policy.js";

const text = z.string().min(1);
const positive = z.number().int().positive();

export const executionDelegationRequestSchema = executionBoundsSchema
  .extend({
    policyVersion: positive,
    expiresAt: z.iso.datetime(),
  })
  .refine(
    ({ readPaths, writePaths, shellCommands }) =>
      readPaths.length + writePaths.length + shellCommands.length > 0,
    "A delegation must specify at least one capability."
  );
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
    confirmationBinding: text,
    approval: humanConfirmationEvidenceSchema,
    issuedAt: z.iso.datetime(),
  })
  .strict();
export type ExecutionDelegation = z.infer<typeof executionDelegationSchema>;
