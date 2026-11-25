import { z } from "zod";

const text = z.string().trim().min(1);
export const approvedDecisionSchema = z
  .object({
    id: text,
    reviewId: text,
    reviewBinding: text,
    approvalRecordId: text,
  })
  .strict();
export type ApprovedDecision = z.infer<typeof approvedDecisionSchema>;
