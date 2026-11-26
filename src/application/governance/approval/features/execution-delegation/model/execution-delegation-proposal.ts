import { z } from "zod";
import { sourceReferenceSchema } from "@/application/management/decision-support/synthesis/index.js";
import { scopedExecutionBoundsSchema } from "../../system-policy/model/execution-system-policy.js";

export const executionDelegationDraftSchema =
  scopedExecutionBoundsSchema.extend({
    durationMs: z.number().int().positive(),
    rationale: z.string().trim().min(1),
    sources: z.array(sourceReferenceSchema).min(1),
  });

export const executionDelegationProposalSchema =
  executionDelegationDraftSchema.extend({
    policyVersion: z.number().int().positive(),
    synthesisDigest: z.string().regex(/^[a-f0-9]{64}$/),
  });

export type ExecutionDelegationProposal = z.infer<
  typeof executionDelegationProposalSchema
>;
