import { z } from "zod";
import { humanConfirmationEvidenceSchema as confirmation } from "../../../shared/model/confirmation.js";
const text = z.string().min(1);
const date = z.iso.datetime();

export const approvalRecordSchema = z
  .object({
    id: text,
    proposalId: text,
    proposalDigest: text,
    approvedAt: date,
    systemPolicyVersion: z.number().int().positive(),
    source: z.discriminatedUnion("type", [
      z.object({ type: z.literal("direct-human"), confirmation }).strict(),
      z
        .object({
          type: z.literal("human-delegation"),
          delegationPolicyId: text,
          delegationPolicyVersion: z.number().int().positive(),
          delegationApprovalId: text,
        })
        .strict(),
    ]),
  })
  .strict();
export type ApprovalRecord = z.infer<typeof approvalRecordSchema>;
