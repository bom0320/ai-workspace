import { z } from "zod";
import { workItemSchema } from "@/application/management/work-decomposition/index.js";
import { repositorySnapshotSchema } from "@/contracts/repository/snapshot.js";

const text = z.string().min(1);
const digest = z.string().regex(/^[a-f0-9]{64}$/);

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
