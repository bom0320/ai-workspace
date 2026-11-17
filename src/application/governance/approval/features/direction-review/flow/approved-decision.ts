import { withGovernanceLedger } from "../../../../records/governance-transaction.js";
import { resolveReviewRecord } from "./context/resolve-review-context.js";

// Resolves direction, original Goal/Snapshot and the actual Human record without
// duplicating the Proposal in ApprovedDecision. This grants no Task execution right.
export function getApprovedDecision(id: string) {
  return withGovernanceLedger((ledger) => {
    const matches = Object.values(ledger.repositories).flatMap((entry) =>
      (entry.approvedDecisions ?? [])
        .filter((value) => value.id === id)
        .map((decision) => ({ entry, decision }))
    );
    if (matches.length !== 1)
      throw new Error("ApprovedDecision is unavailable.");
    const { entry, decision } = matches[0];
    const {
      entry: reviewEntry,
      review,
      context,
      snapshot,
    } = resolveReviewRecord(ledger, decision.reviewId);
    if (
      entry !== reviewEntry ||
      review.resolution?.action.action !== "approve" ||
      review.resolution.id !== decision.approvalRecordId ||
      review.binding !== decision.reviewBinding
    )
      throw new Error("ApprovedDecision has no matching Human approval.");
    return structuredClone({ decision, review, context, snapshot });
  });
}
