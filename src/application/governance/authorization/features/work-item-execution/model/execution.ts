import { goalSpecSchema } from "@/contracts/goal.js";
import { z } from "zod";
import { workItemSchema } from "@/application/work-decomposition/index.js";
import { repositorySnapshotSchema } from "@/contracts/repository/snapshot.js";
import { taskContractSchema } from "@/contracts/task.js";
import { executionBoundsSchema } from "../../../../approval/features/system-policy/model/execution-system-policy.js";

const text = z.string().min(1);
const digest = z.string().regex(/^[a-f0-9]{64}$/);

export const executionRequestSchema = executionBoundsSchema
  .pick({ readPaths: true, workerMode: true })
  .extend({
    approvedDecisionId: text,
    executionSourceId: digest,
    workItem: workItemSchema,
    task: taskContractSchema.strict(),
    repositoryPath: text,
    timeoutMs: executionBoundsSchema.shape.budget.shape.maxTimeoutMs,
  });
export type ExecutionRequest = z.infer<typeof executionRequestSchema>;

export const readOnlyExecutionRequestSchema = executionRequestSchema
  .omit({ task: true, workerMode: true })
  .strict();

export const workItemExecutionRequestSchema = z.union([
  readOnlyExecutionRequestSchema,
  executionRequestSchema,
]);
export type WorkItemExecutionRequest = z.infer<
  typeof workItemExecutionRequestSchema
>;

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
        status: z.literal("authorized"),
        execution: z.union([
          authorizedExecutionSchema,
          authorizedExecutionSchema.extend({
            request: readOnlyExecutionRequestSchema,
            goal: goalSpecSchema,
          }),
        ]),
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

const executionSourceSchema = z.object({
  id: digest,
  decompositionBinding: digest,
  workItemId: text,
  snapshot: repositorySnapshotSchema,
});

export const workItemExecutionSourceSchema = z.union([
  executionSourceSchema.extend({ taskDigest: digest }).strict(),
  executionSourceSchema.extend({ readOnly: z.literal(true) }).strict(),
]);

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
