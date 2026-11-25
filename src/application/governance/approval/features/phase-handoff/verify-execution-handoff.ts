import type { ExecutionHandoffApproval } from "../../../data-flow/handoff/input.js";
import type { VerifiedPhaseBContext } from "../../../data-flow/handoff/output.js";
import type { GovernanceLedger } from "../../../model/ledger.js";
import { governanceDigest } from "@/services/governance-records/index.js";
import { assertRepositoryMatchesSnapshot } from "@/services/repository-snapshot/index.js";
import {
  resolveGovernanceRepository,
  withGovernanceLedger,
} from "../../../records/governance-transaction.js";
import { resolveApprovedDecision } from "../direction-review/flow/approved-decision.js";
import {
  currentPolicyForExecutionGrant,
  executionDelegationId,
} from "../execution-delegation/validation/validate-execution-delegation-records.js";

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
    synthesisProposal: review.proposal,
    decision,
    context,
    snapshot,
    delegation,
    policy: policy.policy,
    policyBinding: policy.binding,
  };
}

function resolveCurrentHandoff(
  ledger: GovernanceLedger,
  input: ExecutionHandoffApproval
) {
  const verified = resolveExecutionHandoff(ledger, input);
  assertRepositoryMatchesSnapshot(verified.snapshot);
  return verified;
}

export function verifyExecutionHandoff(input: ExecutionHandoffApproval) {
  return withGovernanceLedger((ledger) => {
    const { decision, delegation } = resolveCurrentHandoff(ledger, input);
    return structuredClone({ decision, executionDelegation: delegation });
  });
}

export function verifyPhaseBHandoff(
  input: ExecutionHandoffApproval
): VerifiedPhaseBContext {
  return withGovernanceLedger((ledger) => {
    const { context, synthesisProposal, snapshot, analysisSources } =
      resolveCurrentHandoff(ledger, input);
    return structuredClone({
      context,
      synthesisProposal,
      snapshot,
      analysisSources: analysisSources.map(({ scope, assignment }) => ({
        scopeId: scope.id,
        scopeVersion: scope.version,
        assignmentId: assignment.assignmentId,
        specialistId: assignment.specialistId,
      })),
    });
  });
}
