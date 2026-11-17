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
import {
  currentScopeSource,
  resolveCurrentReview,
  resolveReviewRecord,
} from "./context/resolve-review-context.js";
import {
  assertAnalysisScope,
  reviewBinding,
  sameContent,
} from "./validation/validate-review-record.js";

// Internal integration writer: only the Synthesis Node may import this function,
// immediately after runSynthesis(). It is intentionally absent from public barrels.
// This is an in-process trusted-code boundary, not a sandbox against arbitrary code.
export function registerDirectionReview(
  scopeId: string,
  input: SynthesisContext,
  proposed: SynthesisProposal,
  previousReviewId?: string
): DirectionReview {
  const { revision, ...context } = synthesisContextSchema.parse(input);
  const proposal = synthesisProposalSchema.parse(proposed);
  return withGovernanceLedger((ledger, save) => {
    const {
      entry,
      issuance: { scope },
    } = currentScopeSource(ledger, scopeId);
    assertAnalysisScope(context, scope);
    let count = 0;
    if (previousReviewId) {
      // This transaction already checked current eligibility for the Scope.
      // The parent must match that same Scope; only its historical binding remains.
      const parent = resolveReviewRecord(ledger, previousReviewId).review;
      if (
        parent.scopeId !== scopeId ||
        parent.resolution?.action.action !== "request-revision" ||
        parent.revision >= 2 ||
        parent.analysisDigest !== governanceDigest(context) ||
        !revision ||
        !sameContent(revision.previousProposal, parent.proposal) ||
        revision.feedback !== parent.resolution.action.feedback
      )
        throw new Error("Revision does not match Human feedback.");
      count = parent.revision + 1;
    } else if (revision)
      throw new Error("Revision requires a recorded Human request.");
    if (
      entry.directionReviews?.some((value) =>
        previousReviewId
          ? value.previousReviewId === previousReviewId
          : value.scopeId === scopeId
      )
    )
      throw new Error("Direction Review has already been registered.");
    const subject = {
      id: randomUUID(),
      scopeId,
      scopeVersion: scope.version,
      analysisDigest: governanceDigest(context),
      proposal,
      ...(!previousReviewId ? { context } : {}),
      revision: count,
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
