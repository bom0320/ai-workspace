import { withGovernanceLedger } from "../../../../records/governance-transaction.js";
import { resolveApprovedDecision } from "../../direction-review/flow/approved-decision.js";
import { executionDelegationId } from "../validation/validate-execution-delegation-records.js";
import type { ExecutionDelegation } from "../model/execution-delegation.js";

// Historical record lookup; callers performing execution must also check expiry
// and enforce the approved limits at the point of authorization.
export function getExecutionDelegation(
  approvedDecisionId: string
): ExecutionDelegation | undefined {
  return withGovernanceLedger((ledger) => {
    const { entry, decision, snapshot } = resolveApprovedDecision(
      ledger,
      approvedDecisionId
    );
    const record = entry.executionDelegations?.find(
      ({ id }) => id === executionDelegationId(decision.id)
    );
    if (!record) return;
    if (record.repositoryRoot !== snapshot.repositoryRoot)
      throw new Error(
        "Execution Delegation does not match the approved Repository."
      );
    const changes =
      entry.executionPolicies?.slice(record.grant.policyVersion) ?? [];
    const status = changes.some(({ policy }) => !policy)
      ? "revoked"
      : changes.length > 0
        ? "superseded"
        : "active";
    return structuredClone({ ...record, status });
  });
}
