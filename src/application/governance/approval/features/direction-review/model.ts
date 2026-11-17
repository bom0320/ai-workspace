import { repositorySnapshotSchema } from "@/contracts/repository/snapshot.js";
import { z } from "zod";
import { agentDecisionSchema } from "@/application/decision/index.js";
import {
  synthesisContextSchema,
  synthesisProposalSchema,
} from "@/application/synthesis/index.js";
import { humanConfirmationEvidenceSchema } from "../../shared/model/confirmation.js";

const text = z.string().trim().min(1);
export const directionAnalysisSchema = z
  .object({
    scopeId: text,
    scopeVersion: z.number().int().positive(),
    decisions: z.array(
      z
        .object({
          invocationId: text,
          assignmentId: text,
          decision: agentDecisionSchema,
        })
        .strict()
    ),
    comparison: synthesisContextSchema.shape.comparison.optional(),
  })
  .strict();

export const directionActionSchema = z.discriminatedUnion("action", [
  z
    .object({ reviewId: text, binding: text, action: z.literal("approve") })
    .strict(),
  z
    .object({ reviewId: text, binding: text, action: z.literal("reject") })
    .strict(),
  z
    .object({
      reviewId: text,
      binding: text,
      action: z.literal("request-revision"),
      feedback: text,
    })
    .strict(),
]);
export type DirectionAction = z.infer<typeof directionActionSchema>;

export const directionReviewSchema = z
  .object({
    id: text,
    scopeId: text,
    scopeVersion: z.number().int().positive(),
    analysisDigest: text,
    proposal: synthesisProposalSchema,
    revision: z.number().int().min(0).max(2),
    previousReviewId: text.optional(),
    binding: text,
    resolution: z
      .object({
        id: text,
        action: directionActionSchema,
        confirmationBinding: text,
        confirmation: humanConfirmationEvidenceSchema,
        resolvedAt: z.iso.datetime(),
      })
      .strict()
      .optional(),
  })
  .strict();
export type DirectionReview = z.infer<typeof directionReviewSchema>;

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
    .object({ status: z.literal("approved"), decision: approvedDecisionSchema })
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
  z.object({ status: z.literal("denied"), reason: text }).strict(),
  z.object({ status: z.literal("failed"), reason: text }).strict(),
]);
export type DirectionGovernanceResult = z.infer<
  typeof directionGovernanceResultSchema
>;
export const directionConfirmationRequestSchema = z
  .object({
    binding: text,
    action: directionActionSchema,
    review: directionReviewSchema,
    context: synthesisContextSchema,
    snapshot: repositorySnapshotSchema,
  })
  .strict();
export type DirectionConfirmationRequest = z.infer<
  typeof directionConfirmationRequestSchema
>;
