import { randomUUID } from "node:crypto";
import {
  consumeValidatedSynthesis,
  type SynthesisResult,
} from "@/application/synthesis/index.js";
import { governanceDigest } from "@/services/governance-records/index.js";
import { withGovernanceLedger } from "../../../../records/governance-transaction.js";
import type { DirectionReview } from "../model.js";
import {
  currentScopeSource,
  analysisContext,
  resolveCurrentReview,
  resolveReviewRecord,
  reviewBinding,
  sameContent,
} from "../shared/resolve-context.js";

export function registerDirectionReview(
  scopeId: string,
  result: Extract<SynthesisResult, { status: "proposed" }>,
  previousReviewId?: string
): DirectionReview {
  const proof = consumeValidatedSynthesis(result);
  return withGovernanceLedger((ledger, save) => {
    const {
      entry,
      issuance: { scope },
    } = currentScopeSource(ledger, scopeId);
    const context = analysisContext(entry, scope);
    const { revision, ...original } = proof.context;
    if (!sameContent(original, context))
      throw new Error("Synthesis has no matching trusted analysis provenance.");
    let count = 0;
    if (previousReviewId) {
      // This transaction already checked current eligibility for the Scope.
      // The parent must match that same Scope; only its historical binding remains.
      const parent = resolveReviewRecord(ledger, previousReviewId).review;
      if (
        parent.scopeId !== scopeId ||
        parent.resolution?.action.action !== "request-revision" ||
        parent.revision >= 2 ||
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
      proposal: proof.proposal,
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
