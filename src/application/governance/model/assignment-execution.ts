import { taskContractSchema } from "@/contracts/specialist/task-contract.js";
import { z } from "zod";
import { agentDecisionSchema } from "@/application/specialist/analysis/index.js";
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
export const authorizedAssignmentWriteExecutionSchema =
  assignmentWriteRequestSchema.extend({
    ...authorizationFields,
    preparedInvocationId: id,
    authority: specialistAuthoritySchema.extend({
      repositoryAccess: z.literal("write"),
      shellExecution: z.literal(true),
    }),
    writePaths: executionBoundsSchema.shape.writePaths.refine(
      (paths) => paths.length > 0
    ),
    verification: executionBoundsSchema.shape.shellCommands,
    workerMode: executionBoundsSchema.shape.workerMode.unwrap(),
  });
export const authorizedAssignmentExecutionSchema = z.discriminatedUnion(
  "access",
  [
    authorizedAssignmentReadExecutionSchema,
    authorizedAssignmentWriteExecutionSchema,
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

export const assignmentReadRecordSchema = z
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

export const assignmentWriteResultSchema = z
  .strictObject({
    passed: z.boolean(),
    artifacts: z
      .strictObject({
        directory: id,
        resultDigest: digest,
        patchDigest: digest.optional(),
      })
      .optional(),
    digest,
  })
  .refine((result) => !result.passed || !!result.artifacts?.patchDigest);
export const assignmentWriteRecordSchema = assignmentReadRecordSchema.extend({
  kind: z.literal("write"),
  request: assignmentWriteRequestSchema,
  execution: authorizedAssignmentWriteExecutionSchema,
  result: assignmentWriteResultSchema.optional(),
});
export const assignmentExecutionRecordSchema = z.union([
  assignmentReadRecordSchema,
  assignmentWriteRecordSchema,
]);
export type AssignmentWriteRecord = z.infer<typeof assignmentWriteRecordSchema>;
export type AssignmentReadRecord = z.infer<typeof assignmentReadRecordSchema>;

export function isAssignmentReadRecord(
  record: AssignmentReadRecord | AssignmentWriteRecord
): record is AssignmentReadRecord {
  return !("kind" in record);
}

export function digestAssignmentWriteResult(
  record: Pick<AssignmentWriteRecord, "id" | "binding">,
  result: Omit<z.infer<typeof assignmentWriteResultSchema>, "digest">
) {
  return governanceDigest({
    id: record.id,
    binding: record.binding,
    passed: result.passed,
    ...(result.artifacts && { artifacts: result.artifacts }),
  });
}

type AssignmentExecutionRecord = z.infer<typeof assignmentReadRecordSchema>;
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
