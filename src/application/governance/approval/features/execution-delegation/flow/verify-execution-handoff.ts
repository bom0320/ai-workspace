import type { GovernanceLedger } from "../../../../model/ledger.js";
import { governanceDigest } from "@/services/governance-records/index.js";
import { assertRepositoryMatchesSnapshot } from "@/services/repository-snapshot/index.js";
import {
  resolveGovernanceRepository,
  withGovernanceLedger,
} from "../../../../records/governance-transaction.js";
import { resolveApprovedDecision } from "../../direction-review/flow/approved-decision.js";
import type { ApprovedDecision } from "../../direction-review/model/result.js";
import type { ExecutionDelegation } from "../model/execution-delegation.js";
import {
  currentPolicyForExecutionGrant,
  executionDelegationId,
} from "../validation/validate-execution-delegation-records.js";

type ExecutionHandoffApproval = {
  decision: ApprovedDecision;
  executionDelegation: ExecutionDelegation;
};

// The caller owns the Ledger transaction and the Repository Snapshot check.
export function resolveExecutionHandoff(
  ledger: GovernanceLedger,
  input: ExecutionHandoffApproval
) {
  const { entry, decision, review, context, snapshot, analysisSources } =
    resolveApprovedDecision(ledger, input.decision.id);
  const delegation = entry.executionDelegations?.find(
    ({ id }) => id === executionDelegationId(decision.id)
  );
  const policy =
    delegation &&
    currentPolicyForExecutionGrant(entry, delegation.grant, Date.now());
  if (
    !review.executionDelegationProposal ||
    !delegation ||
    review.executionDelegationProposal.policyVersion !==
      delegation.grant.policyVersion ||
    delegation.approvalSource === "post-direction" ||
    delegation.status !== "active" ||
    delegation.repositoryRoot !== snapshot.repositoryRoot ||
    resolveGovernanceRepository(snapshot.repositoryRoot) !==
      snapshot.repositoryRoot ||
    governanceDigest(decision) !== governanceDigest(input.decision) ||
    governanceDigest(delegation) !==
      governanceDigest(input.executionDelegation) ||
    !policy?.policy
  )
    throw new Error(
      "Execution Handoff lacks a matching, current joint approval."
    );
  return {
    entry,
    analysisSources,
    approvedDirection: review.proposal.direction.text,
    decision,
    context,
    snapshot,
    delegation,
    policy: policy.policy,
    policyBinding: policy.binding,
  };
}

export function verifyExecutionHandoff(input: ExecutionHandoffApproval) {
  return withGovernanceLedger((ledger) => {
    const { decision, delegation, snapshot } = resolveExecutionHandoff(
      ledger,
      input
    );
    assertRepositoryMatchesSnapshot(snapshot);
    return structuredClone({ decision, executionDelegation: delegation });
  });
}
