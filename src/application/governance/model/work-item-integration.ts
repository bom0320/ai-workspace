import { z } from "zod";
import { repositorySnapshotSchema } from "@/contracts/repository/snapshot.js";

const id = z.string().min(1);
const digest = z.string().regex(/^[a-f0-9]{64}$/);
const artifacts = z.strictObject({
  directory: id,
  patchDigest: digest,
  resultDigest: digest,
});
const reference = {
  assignmentId: id,
  invocationId: id,
  resultDigest: digest,
};
const base = {
  planId: digest,
  workItemId: id,
  snapshot: repositorySnapshotSchema,
  assignmentResults: z
    .array(
      z.discriminatedUnion("status", [
        z.strictObject({ ...reference, status: z.literal("read-completed") }),
        z.strictObject({
          ...reference,
          status: z.literal("write-completed"),
          taskContractBinding: digest,
          artifacts,
        }),
      ])
    )
    .min(1),
};
export const workItemResultSchema = z.discriminatedUnion("status", [
  z.strictObject({ ...base, status: z.literal("read-integrated") }),
  z.strictObject({
    ...base,
    status: z.literal("write-integrated"),
    artifacts,
    changedPaths: z.array(id).min(1),
  }),
]);
export type WorkItemResult = z.infer<typeof workItemResultSchema>;

export const workItemIntegrationRecordSchema = z.strictObject({
  delegationId: id,
  approvalBinding: digest,
  result: workItemResultSchema,
  digest,
});
