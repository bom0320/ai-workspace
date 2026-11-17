import { randomUUID } from "node:crypto";
import type { HumanConfirmation } from "@/infrastructure/terminal/index.js";
import { governanceDigest } from "@/services/governance-records/index.js";
import { withGovernanceLedger } from "../../../../records/governance-transaction.js";
import { consumeCurrentHumanConfirmation } from "../../../shared/validation/approval-input.js";
import {
  directionActionSchema,
  type DirectionAction,
} from "../model/action.js";
import type { DirectionReview } from "../model/review.js";
import type {
  DirectionConfirmationRequest,
  DirectionGovernanceResult,
} from "../model/result.js";
import { resolveCurrentReview } from "./context/resolve-review-context.js";

function assertPendingAction(
  review: DirectionReview,
  action: DirectionAction
): void {
  if (
    review.binding !== action.binding ||
    review.resolution ||
    (action.action === "request-revision" && review.revision >= 2)
  )
    throw new Error(
      "Review is stale, resolved, mismatched or at its revision limit."
    );
}
function confirmationBinding(
  review: DirectionReview,
  action: DirectionAction
): string {
  return governanceDigest({ reviewBinding: review.binding, action });
}

export function prepareDirectionConfirmation(
  input: unknown
): DirectionConfirmationRequest {
  const action = directionActionSchema.parse(input);
  return withGovernanceLedger((ledger) => {
    const { review, context, snapshot } = resolveCurrentReview(
      ledger,
      action.reviewId
    );
    assertPendingAction(review, action);
    return structuredClone({
      action,
      review,
      context,
      snapshot,
      binding: confirmationBinding(review, action),
    });
  });
}

export function finalizeDirectionReview(
  input: unknown,
  receipt?: HumanConfirmation
): DirectionGovernanceResult {
  try {
    const action: DirectionAction = directionActionSchema.parse(input);
    return withGovernanceLedger((ledger, save): DirectionGovernanceResult => {
      const { entry, review } = resolveCurrentReview(ledger, action.reviewId);
      assertPendingAction(review, action);
      const binding = confirmationBinding(review, action);
      const confirmation = consumeCurrentHumanConfirmation(receipt, binding);
      if (!confirmation) {
        if (receipt)
          throw new Error("Human Confirmation is invalid or already consumed.");
        return { status: "confirmation-required", reviewId: review.id };
      }
      review.resolution = {
        id: randomUUID(),
        action,
        confirmationBinding: binding,
        confirmation,
        resolvedAt: new Date().toISOString(),
      };
      if (action.action === "approve") {
        const decision = {
          id: randomUUID(),
          reviewId: review.id,
          reviewBinding: review.binding,
          approvalRecordId: review.resolution.id,
        };
        (entry.approvedDecisions ??= []).push(decision);
        save();
        return { status: "approved", decision };
      }
      save();
      return action.action === "reject"
        ? { status: "rejected", reviewId: review.id }
        : {
            status: "revision-requested",
            reviewId: review.id,
            feedback: action.feedback,
          };
    });
  } catch {
    return {
      status: "denied",
      reason: "Direction Review or Human Confirmation could not be verified.",
    };
  }
}
