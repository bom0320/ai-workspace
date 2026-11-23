import { codexWorktreeModeNotice } from "../../system-policy/model/execution-system-policy.js";
import { z } from "zod";
import type { HumanConfirmation } from "@/infrastructure/terminal/index.js";
import { assertRepositoryMatchesSnapshot } from "@/services/repository-snapshot/index.js";
import { governanceDigest } from "@/services/governance-records/index.js";
import type { RepositorySnapshot } from "@/contracts/repository/snapshot.js";
import {
  resolveGovernanceRepository,
  withGovernanceLedger,
} from "../../../../records/governance-transaction.js";
import { consumeCurrentHumanConfirmation } from "../../../shared/validation/approval-input.js";
import { resolveApprovedDecision } from "../../direction-review/flow/approved-decision.js";
import type { ApprovedDecision } from "../../direction-review/model/result.js";
import {
  executionDelegationRequestSchema,
  type ExecutionDelegation,
  type ExecutionDelegationRequest,
} from "../model/execution-delegation.js";
import {
  currentPolicyForExecutionGrant,
  executionDelegationId,
  postDirectionDelegationBinding,
} from "../validation/validate-execution-delegation-records.js";

const inputSchema = z
  .object({
    approvedDecisionId: z.string().min(1),
    repositoryPath: z.string().min(1),
    grant: executionDelegationRequestSchema,
  })
  .strict();

type Result =
  | {
      status: "confirmation-required";
      binding: string;
      decision: ApprovedDecision;
      snapshot: RepositorySnapshot;
      grant: ExecutionDelegationRequest;
      workerModeNotice?: string;
    }
  | { status: "approved"; executionDelegation: ExecutionDelegation }
  | { status: "denied"; reason: string };

// With no receipt, return the exact subject for a trusted Human prompt.
export function approveExecutionDelegation(
  input: unknown,
  receipt?: HumanConfirmation
): Result {
  let consumed = false;
  try {
    const { approvedDecisionId, repositoryPath, grant } =
      inputSchema.parse(input);
    return withGovernanceLedger((ledger, save): Result => {
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
