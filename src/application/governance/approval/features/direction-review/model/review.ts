import { z } from "zod";
import { agentDecisionSchema } from "@/application/decision/index.js";
import {
  synthesisContextSchema,
  synthesisProposalSchema,
} from "@/application/synthesis/index.js";
import { humanConfirmationEvidenceSchema } from "../../../shared/model/confirmation.js";
import { directionActionSchema } from "./action.js";

const text = z.string().trim().min(1);
// Read-only compatibility for ledgers written before Context-at-review storage.
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

export const directionReviewSchema = z
  .object({
    id: text,
    scopeId: text,
    scopeVersion: z.number().int().positive(),
    analysisDigest: text,
    // Only the initial Review stores the analysis; revisions reference their parent.
    context: synthesisContextSchema.omit({ revision: true }).optional(),
    analysisInvocationIds: z.array(text).min(1).optional(),
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
