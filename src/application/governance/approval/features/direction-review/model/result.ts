import { z } from "zod";
import { repositorySnapshotSchema } from "@/contracts/repository/snapshot.js";
import { synthesisContextSchema } from "@/application/synthesis/index.js";
import { directionActionSchema } from "./action.js";
import { directionReviewSchema } from "./review.js";
import { executionDelegationSchema } from "../../execution-delegation/model/execution-delegation.js";

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

export const directionGovernanceResultSchema = z.discriminatedUnion("status", [
  z
    .object({
      status: z.literal("approved"),
      decision: approvedDecisionSchema,
      executionDelegation: executionDelegationSchema.optional(),
    })
    .strict(),
  z.object({ status: z.literal("rejected"), reviewId: text }).strict(),
  z
    .object({
      status: z.literal("revision-requested"),
      reviewId: text,
      feedback: text,
    })
    .strict(),
  z
    .object({ status: z.literal("confirmation-required"), reviewId: text })
    .strict(),
  z
    .object({
      status: z.literal("denied"),
      reason: text,
      reasonCode: z.literal("execution-policy").optional(),
    })
    .strict(),
  z.object({ status: z.literal("failed"), reason: text }).strict(),
]);
export type DirectionGovernanceResult = z.infer<
  typeof directionGovernanceResultSchema
>;
export const directionConfirmationRequestSchema = z
  .object({
    binding: text,
    workerModeNotice: text.optional(),
    action: directionActionSchema,
    review: directionReviewSchema,
    context: synthesisContextSchema,
    snapshot: repositorySnapshotSchema,
  })
  .strict();
export type DirectionConfirmationRequest = z.infer<
  typeof directionConfirmationRequestSchema
>;
