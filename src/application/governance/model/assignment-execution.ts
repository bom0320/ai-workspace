import { taskContractSchema } from "@/contracts/task.js";
import { z } from "zod";
import { agentDecisionSchema } from "@/application/decision/index.js";
import { governanceDigest } from "@/services/governance-records/index.js";
import { repositorySnapshotSchema } from "@/contracts/repository/snapshot.js";
import { specialistAuthoritySchema } from "@/contracts/specialist/authority.js";
import {
  executionBoundsSchema,
  scopedExecutionBoundsSchema,
} from "../approval/features/system-policy/model/execution-system-policy.js";

const digest = z.string().regex(/^[a-f0-9]{64}$/);
const id = z.string().min(1);
const requestFields = {
  planId: digest,
  assignmentId: id,
  timeoutMs: executionBoundsSchema.shape.budget.shape.maxTimeoutMs,
};

const readScopes = scopedExecutionBoundsSchema.shape.readScopes.refine(
  (scopes) => scopes.length > 0,
  "At least one Repository read scope is required."
);
export const assignmentReadRequestSchema = z.strictObject({
  ...requestFields,
  access: z.literal("read"),
  readScopes,
  initialReadPaths: executionBoundsSchema.shape.readPaths
    .refine((paths) => paths.length > 0 && paths.length <= 32)
    .optional(),
});
export const assignmentWriteRequestSchema = z.strictObject({
  ...requestFields,
  access: z.literal("write"),
  taskContractBinding: digest,
  readPaths: executionBoundsSchema.shape.readPaths,
});
export const assignmentExecutionRequestSchema = z.discriminatedUnion("access", [
  assignmentReadRequestSchema,
  assignmentWriteRequestSchema,
]);
export type AssignmentExecutionRequest = z.infer<
  typeof assignmentExecutionRequestSchema
>;

const authorizationFields = {
  ...requestFields,
  id,
  specialistId: id,
  snapshot: repositorySnapshotSchema,
  delegationId: id,
  delegationBinding: digest,
  policyBinding: digest,
  expiresAt: z.iso.datetime(),
};
export const authorizedAssignmentReadExecutionSchema = z.strictObject({
  ...authorizationFields,
  access: z.literal("read"),
  readScopes,
  initialReadPaths: assignmentReadRequestSchema.shape.initialReadPaths,
  authority: specialistAuthoritySchema.extend({
    repositoryAccess: z.literal("read"),
    shellExecution: z.literal(false),
  }),
});
export const authorizedAssignmentExecutionSchema = z.discriminatedUnion(
  "access",
  [
    authorizedAssignmentReadExecutionSchema,
    assignmentWriteRequestSchema.extend({
      ...authorizationFields,
      authority: specialistAuthoritySchema.extend({
        repositoryAccess: z.literal("write"),
      }),
      writePaths: executionBoundsSchema.shape.writePaths.refine(
        (paths) => paths.length > 0
      ),
      verification: executionBoundsSchema.shape.shellCommands,
      workerMode: executionBoundsSchema.shape.workerMode.unwrap(),
    }),
  ]
);
export type AuthorizedAssignmentExecution = z.infer<
  typeof authorizedAssignmentExecutionSchema
>;

// Revocation and supersession change status without rewriting historical grants.
export function assignmentDelegationBinding<T extends { status: string }>(
  delegation: T
) {
  return governanceDigest({ ...delegation, status: "active" });
}

export const assignmentExecutionFailureStageSchema = z.enum([
  "authority",
  "unsupported",
  "budget",
  "duplicate",
  "claim",
  "dependency",
  "validation",
  "handoff",
  "snapshot",
  "execution",
  "planning-blocked",
  "legacy-write-plan",
  "planning",
]);
export type AssignmentExecutionFailureStage = z.infer<
  typeof assignmentExecutionFailureStageSchema
>;

export class AssignmentExecutionError extends Error {
  constructor(public readonly failure: AssignmentExecutionFailureStage) {
    super(`Collaborative Assignment failed at ${failure}.`);
  }
}

export const assignmentExecutionRecordSchema = z
  .object({
    id,
    delegationId: id,
    request: assignmentReadRequestSchema,
    execution: authorizedAssignmentReadExecutionSchema,
    binding: digest,
    reservedAt: z.iso.datetime(),
    claimedAt: z.iso.datetime().optional(),
    failure: z
      .object({
        stage: assignmentExecutionFailureStageSchema,
        digest,
        reason: z.string().trim().min(1).max(2048).optional(),
      })
      .strict()
      .optional(),
    result: z
      .union([
        z
          .object({
            decision: agentDecisionSchema,
            contextDigest: digest.optional(),
            digest,
          })
          .strict(),
        z.strictObject({
          status: z.literal("task-prepared"),
          contextDigest: digest,
          task: taskContractSchema.strict(),
          taskContractBinding: digest,
          digest,
        }),
      ])
      .optional(),
  })
  .strict();

type AssignmentExecutionRecord = z.infer<
  typeof assignmentExecutionRecordSchema
>;
type PreparedTask = Extract<
  NonNullable<AssignmentExecutionRecord["result"]>,
  { status: "task-prepared" }
>;

export function digestPreparedAssignmentTask(
  record: Pick<AssignmentExecutionRecord, "id" | "binding">,
  result: Pick<PreparedTask, "status" | "contextDigest" | "task">
) {
  const subject = {
    id: record.id,
    binding: record.binding,
    contextDigest: result.contextDigest,
  };
  const taskContractBinding = governanceDigest({
    ...subject,
    status: result.status,
    task: result.task,
  });
  return {
    taskContractBinding,
    digest: governanceDigest({ ...subject, taskContractBinding }),
  };
}
