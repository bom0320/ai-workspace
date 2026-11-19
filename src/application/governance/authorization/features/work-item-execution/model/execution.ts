import { z } from "zod";
import { workItemSchema } from "@/application/work-decomposition/index.js";
import { repositorySnapshotSchema } from "@/contracts/repository/snapshot.js";
import { taskContractSchema } from "@/contracts/task.js";
import { executionBoundsSchema } from "../../../../approval/features/system-policy/model/execution-system-policy.js";

const text = z.string().min(1);
const digest = z.string().regex(/^[a-f0-9]{64}$/);

export const executionRequestSchema = executionBoundsSchema
  .omit({ budget: true })
  .extend({
    approvedDecisionId: text,
    executionSourceId: digest,
    workItem: workItemSchema,
    task: taskContractSchema.strict(),
    repositoryPath: text,
    timeoutMs: executionBoundsSchema.shape.budget.shape.maxTimeoutMs,
  });
export type ExecutionRequest = z.infer<typeof executionRequestSchema>;

export const authorizedExecutionSchema = z
  .object({
    id: text,
    request: executionRequestSchema,
    snapshot: repositorySnapshotSchema,
    delegationId: text,
    delegationBinding: digest,
    policyVersion: z.number().int().positive(),
    policyBinding: digest,
    expiresAt: z.iso.datetime(),
  })
  .strict();
export type AuthorizedExecution = z.infer<typeof authorizedExecutionSchema>;

export const executionAuthorizationVerdictSchema = z.discriminatedUnion(
  "status",
  [
    z
      .object({
        status: z.literal("allowed"),
        execution: authorizedExecutionSchema,
      })
      .strict(),
    z.object({ status: z.literal("approval-required"), reason: text }).strict(),
    z.object({ status: z.literal("denied"), reason: text }).strict(),
  ]
);
export type ExecutionAuthorizationVerdict = z.infer<
  typeof executionAuthorizationVerdictSchema
>;

export const executionDecompositionSchema = z
  .object({
    binding: digest,
    approvedDecisionId: text,
    approvalBinding: digest,
    workItems: z.array(workItemSchema).min(1),
  })
  .strict();

export const workItemExecutionSourceSchema = z
  .object({
    id: digest,
    decompositionBinding: digest,
    workItemId: text,
    taskDigest: digest,
    snapshot: repositorySnapshotSchema,
  })
  .strict();

export const executionReservationSchema = z
  .object({
    id: text,
    sourceId: digest,
    delegationId: text,
    requestDigest: digest,
    executionDigest: digest,
    reservedAt: z.iso.datetime(),
    claimedAt: z.iso.datetime().optional(),
  })
  .strict();
