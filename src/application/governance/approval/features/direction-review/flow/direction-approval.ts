import { codexWorktreeModeNotice } from "../../system-policy/model/execution-system-policy.js";
import { RepositorySnapshotMismatchError } from "@/services/repository-snapshot/index.js";
import { StaffingIssuanceValidationError } from "../../proposal-management/flow/validation/staffing-issuance.js";
import { DirectionReviewValidationError } from "./validation/validate-review-record.js";
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
} from "../../../../data-flow/direction-review/output.js";
import { resolveCurrentReview } from "./context/resolve-review-context.js";
import type { RepositoryGovernance } from "../../../../model/ledger.js";
import {
  executionDelegationId,
  currentPolicyForExecutionGrant,
} from "../../execution-delegation/validation/validate-execution-delegation-records.js";
import type { ExecutionDelegation } from "../../execution-delegation/model/execution-delegation.js";

class ExecutionDelegationPolicyError extends DirectionReviewValidationError {}

function assertExecutionDelegationAllowed(
  entry: RepositoryGovernance,
  action: DirectionAction,
  now: number
): void {
  if (action.action !== "approve" || !action.executionDelegation) return;
  if (!currentPolicyForExecutionGrant(entry, action.executionDelegation, now))
    throw new ExecutionDelegationPolicyError(
      "Execution Delegation exceeds the current approved policy."
    );
}

function assertPendingAction(
  review: DirectionReview,
  action: DirectionAction
): void {
  if (
    review.binding !== action.binding ||
    review.resolution ||
    (action.action === "request-revision" && review.revision >= 2)
  )
    throw new DirectionReviewValidationError(
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
    const { entry, review, context, snapshot } = resolveCurrentReview(
      ledger,
      action.reviewId
    );
    assertPendingAction(review, action);
    assertExecutionDelegationAllowed(entry, action, Date.now());
    return structuredClone({
      action,
      review,
      context,
      snapshot,
      binding: confirmationBinding(review, action),
      ...(action.action === "approve" &&
        action.executionDelegation?.workerMode && {
          workerModeNotice: codexWorktreeModeNotice,
        }),
    });
  });
}

export function finalizeDirectionReview(
  input: unknown,
  receipt?: HumanConfirmation
): DirectionGovernanceResult {
  // 1. Parse the Action Before Opening the Ledger
  let confirmationConsumed = false;
  try {
    const parsed = directionActionSchema.safeParse(input);
    if (!parsed.success)
      return { status: "denied", reason: "Invalid Direction Review action." };
    const action = parsed.data;
    return withGovernanceLedger((ledger, save): DirectionGovernanceResult => {
      // 2. Revalidate the Current Review and Exact Action Binding
      const { entry, review, snapshot } = resolveCurrentReview(
        ledger,
        action.reviewId
      );
      assertPendingAction(review, action);
      assertExecutionDelegationAllowed(entry, action, Date.now());
      const binding = confirmationBinding(review, action);

      // 3. Consume the One-use Human Confirmation
      confirmationConsumed = true;
      const confirmation = consumeCurrentHumanConfirmation(receipt, binding);
      if (!confirmation) {
        if (receipt)
          throw new DirectionReviewValidationError(
            "Human Confirmation is invalid or already consumed."
          );
        return { status: "confirmation-required", reviewId: review.id };
      }

      // 4. Record the Resolution and Construct the Action Result
      const resolvedAt = new Date();
      assertExecutionDelegationAllowed(entry, action, resolvedAt.getTime());
      review.resolution = {
        id: randomUUID(),
        action,
        confirmationBinding: binding,
        confirmation,
        resolvedAt: resolvedAt.toISOString(),
      };
      let result: DirectionGovernanceResult;
      switch (action.action) {
        case "approve": {
          const decision = {
            id: randomUUID(),
            reviewId: review.id,
            reviewBinding: review.binding,
            approvalRecordId: review.resolution.id,
          };
          (entry.approvedDecisions ??= []).push(decision);
          result = { status: "approved", decision };
          if (action.executionDelegation) {
            const executionDelegation: ExecutionDelegation = {
              id: executionDelegationId(decision.id),
              approvedDecisionId: decision.id,
              repositoryRoot: snapshot.repositoryRoot,
              grant: action.executionDelegation,
              status: "active",
              approvalRecordId: decision.approvalRecordId,
              confirmationBinding: binding,
              approval: confirmation,
              issuedAt: review.resolution.resolvedAt,
            };
            (entry.executionDelegations ??= []).push(executionDelegation);
            result = { ...result, executionDelegation };
          }
          break;
        }
        case "reject":
          result = { status: "rejected", reviewId: review.id };
          break;
        case "request-revision":
          result = {
            status: "revision-requested",
            reviewId: review.id,
            feedback: action.feedback,
          };
          break;
      }

      // 5. Persist Once Before Returning Any Successful Decision
      save();
      return result;
    });
  } catch (error) {
    if (error instanceof ExecutionDelegationPolicyError)
      return {
        status: "denied",
        reason: error.message,
        reasonCode: "execution-policy",
      };
    if (
      error instanceof DirectionReviewValidationError ||
      error instanceof StaffingIssuanceValidationError ||
      error instanceof RepositorySnapshotMismatchError
    )
      return {
        status: "denied",
        reason: "Direction Review or Human Confirmation could not be verified.",
      };
    // Read/write, integrity/access and unclassified errors fail closed. Raw
    // exceptions may contain paths or process output and are not public reasons.
    return {
      status: "failed",
      reason: "Direction Review could not be finalized or persisted.",
    };
  } finally {
    // Rejecting an action before its binding is available must still burn a
    // supplied receipt. Never let a failed attempt authenticate another attempt.
    if (receipt && !confirmationConsumed)
      consumeCurrentHumanConfirmation(receipt, "");
  }
}
