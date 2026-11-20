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

// Read both records in a single trusted transaction. The Ledger validates the
// approval evidence and the exact grant against the approved Review resolution.
export function verifyExecutionHandoff(input: {
  decision: ApprovedDecision;
  executionDelegation: ExecutionDelegation;
}) {
  return withGovernanceLedger((ledger) => {
    const { entry, decision, review, snapshot } = resolveApprovedDecision(
      ledger,
      input.decision.id
    );
    const delegation = entry.executionDelegations?.find(
      ({ id }) => id === executionDelegationId(decision.id)
    );
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
      !currentPolicyForExecutionGrant(entry, delegation.grant, Date.now())
    )
      throw new Error(
        "Execution Handoff lacks a matching, current joint approval."
      );
    assertRepositoryMatchesSnapshot(snapshot);
    return structuredClone({ decision, executionDelegation: delegation });
  });
}
