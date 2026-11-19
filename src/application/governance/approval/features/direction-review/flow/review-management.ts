import { randomUUID } from "node:crypto";
import {
  synthesisContextSchema,
  synthesisProposalSchema,
  type SynthesisContext,
  type SynthesisProposal,
} from "@/application/synthesis/index.js";
import { governanceDigest } from "@/services/governance-records/index.js";
import { withGovernanceLedger } from "../../../../records/governance-transaction.js";
import type { DirectionReview } from "../model/review.js";
import { verifyAnalysisSources } from "../../../../records/analysis/analysis-provenance.js";
import {
  currentScopeSource,
  resolveCurrentReview,
  resolveReviewRecord,
} from "./context/resolve-review-context.js";
import {
  assertAnalysisScope,
  reviewBinding,
  validateRevisionRequest,
  assertReviewNotRegistered,
} from "./validation/validate-review-record.js";

// Internal integration writer: only the Synthesis Node may import this function,
// immediately after runSynthesis(). It is intentionally absent from public barrels.
// This is an in-process trusted-code boundary, not a sandbox against arbitrary code.
export function registerDirectionReview(
  scopeId: string,
  input: SynthesisContext,
  proposed: SynthesisProposal,
  previousReviewId?: string,
  invocationIds?: string[]
): DirectionReview {
  // 1. Parse the Synthesis Context and Proposal
  const { revision, ...context } = synthesisContextSchema.parse(input);
  const proposal = synthesisProposalSchema.parse(proposed);
  return withGovernanceLedger((ledger, save) => {
    // 2. Resolve the Approved Scope and Match the Analysis
    const {
      entry,
      issuance: { scope },
    } = currentScopeSource(ledger, scopeId);

    // 3. Validate the Revision Against Its Stored Human Request
    // Current eligibility for this Scope was checked in this transaction;
    // resolve the parent record without repeating that live-policy check.
    const previousReview = previousReviewId
      ? resolveReviewRecord(ledger, previousReviewId).review
      : undefined;
    const analysisInvocationIds = previousReview
      ? previousReview.analysisInvocationIds
      : invocationIds;
    if (analysisInvocationIds)
      verifyAnalysisSources(
        entry,
        scopeId,
        context,
        analysisInvocationIds,
        true
      );
    else assertAnalysisScope(context, scope);
    const revisionRound = validateRevisionRequest({
      scopeId,
      context,
      revision,
      previousReviewId,
      previousReview,
    });

    // 4. Reject Duplicate Initial or Revision Reviews
    assertReviewNotRegistered(
      entry.directionReviews,
      scopeId,
      previousReviewId
    );

    // 5. Create and Persist the Bound Review
    const subject = {
      id: randomUUID(),
      scopeId,
      scopeVersion: scope.version,
      analysisDigest: governanceDigest(context),
      proposal,
      ...(!previousReviewId ? { context } : {}),
      ...(analysisInvocationIds && { analysisInvocationIds }),
      revision: revisionRound,
      ...(previousReviewId ? { previousReviewId } : {}),
    };
    const review = { ...subject, binding: reviewBinding(subject) };
    (entry.directionReviews ??= []).push(review);
    save();
    return structuredClone(review);
  });
}

export function getDirectionReview(reviewId: string) {
  return withGovernanceLedger((ledger) => {
    const { review, context, snapshot } = resolveCurrentReview(
      ledger,
      reviewId
    );
    return structuredClone({ review, context, snapshot });
  });
}
