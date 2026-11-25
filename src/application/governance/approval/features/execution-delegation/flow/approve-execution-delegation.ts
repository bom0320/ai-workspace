import { executionDelegationApprovalInputSchema } from "../../../../data-flow/execution-delegation/input.js";
import type { ExecutionDelegationApprovalResult as ApprovalResult } from "../../../../data-flow/execution-delegation/output.js";
import { codexWorktreeModeNotice } from "../../system-policy/model/execution-system-policy.js";
import type { HumanConfirmation } from "@/infrastructure/terminal/index.js";
import { assertRepositoryMatchesSnapshot } from "@/services/repository-snapshot/index.js";
import { governanceDigest } from "@/services/governance-records/index.js";
import {
  resolveGovernanceRepository,
  withGovernanceLedger,
} from "../../../../records/governance-transaction.js";
import { consumeCurrentHumanConfirmation } from "../../../shared/validation/approval-input.js";
import { resolveApprovedDecision } from "../../direction-review/flow/approved-decision.js";
import type { ExecutionDelegation } from "../model/execution-delegation.js";
import {
  currentPolicyForExecutionGrant,
  executionDelegationId,
  postDirectionDelegationBinding,
} from "../validation/validate-execution-delegation-records.js";

// With no receipt, return the exact subject for a trusted Human prompt.
export function approveExecutionDelegation(
  input: unknown,
  receipt?: HumanConfirmation
): ApprovalResult {
  let consumed = false;
  try {
    const { approvedDecisionId, repositoryPath, grant } =
      executionDelegationApprovalInputSchema.parse(input);
    return withGovernanceLedger((ledger, save): ApprovalResult => {
      const { entry, decision, review, snapshot } = resolveApprovedDecision(
        ledger,
        approvedDecisionId
      );
      const resolution = review.resolution;
      const repositoryRoot = resolveGovernanceRepository(repositoryPath);
      const id = executionDelegationId(decision.id);
      if (
        repositoryRoot !== snapshot.repositoryRoot ||
        resolution?.action.action !== "approve" ||
        resolution.action.executionDelegation ||
        entry.executionDelegations?.some((record) => record.id === id)
      )
        throw new Error(
          "Execution Delegation is unavailable for this Decision."
        );
      assertRepositoryMatchesSnapshot(snapshot);
      const policy = currentPolicyForExecutionGrant(entry, grant, Date.now());
      if (!policy)
        throw new Error("Execution Delegation exceeds current policy.");

      const binding = postDirectionDelegationBinding(
        decision,
        governanceDigest(resolution),
        snapshot,
        policy.binding,
        grant
      );
      if (!receipt)
        return {
          status: "confirmation-required",
          binding,
          decision,
          snapshot,
          grant,
          ...(grant.workerMode && {
            workerModeNotice: codexWorktreeModeNotice,
          }),
        };

      consumed = true;
      const approval = consumeCurrentHumanConfirmation(receipt, binding);
      const issuedAt = new Date();
      if (
        !approval ||
        !currentPolicyForExecutionGrant(entry, grant, issuedAt.getTime())
      )
        throw new Error("Execution Delegation confirmation is unavailable.");

      const executionDelegation: ExecutionDelegation = {
        id,
        approvedDecisionId: decision.id,
        repositoryRoot,
        grant,
        status: "active",
        approvalSource: "post-direction",
        approvalRecordId: decision.approvalRecordId,
        confirmationBinding: binding,
        approval,
        issuedAt: issuedAt.toISOString(),
      };
      (entry.executionDelegations ??= []).push(executionDelegation);
      save();
      return { status: "approved", executionDelegation };
    });
  } catch {
    return {
      status: "denied",
      reason:
        "Execution Delegation approval is invalid, unavailable or could not be persisted.",
    };
  } finally {
    if (receipt && !consumed) consumeCurrentHumanConfirmation(receipt, "");
  }
}
