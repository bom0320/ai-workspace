import { governanceDigest } from "@/services/governance-records/index.js";
import {
  AssignmentExecutionError,
  authorizedAssignmentExecutionSchema,
  isAssignmentReadRecord,
  type AuthorizedAssignmentExecution,
} from "../../../../../model/assignment-execution.js";
import { withGovernanceLedger } from "../../../../../records/governance-transaction.js";
import { resolvePreparedAssignmentPlan } from "../../../../../records/assignment-plans/assignment-plan-records.js";
import type { Handoff } from "../../../../../records/assignment-plans/prepare-assignment-context.js";
import {
  bindAssignmentReadExecution,
  bindAssignmentWriteExecution,
} from "../binding/bind-assignment-execution.js";
import {
  assertAssignmentReadDependencies,
  resolveAssignmentBinding,
} from "../context/resolve-assignment-execution.js";

// A persisted Claim alone cannot start a new context session. Only the object
// returned by a successful transaction in this process can be consumed.
const unusedClaims = new WeakMap<object, string>();

export function claimAssignmentExecution(handoff: Handoff, input: unknown) {
  const execution = authorizedAssignmentExecutionSchema.parse(input);
  const claimed = withGovernanceLedger((ledger, save) => {
    const prepared = resolvePreparedAssignmentPlan(
      ledger,
      handoff,
      execution.planId
    );
    const record = prepared.entry.assignmentExecutions?.find(
      (value) =>
        value.id === execution.id && value.request.planId === execution.planId
    );
    if (!record || record.claimedAt || record.failure)
      throw new AssignmentExecutionError("claim");

    const context = resolveAssignmentBinding(prepared, record.request);
    assertAssignmentReadDependencies(context);
    const current = isAssignmentReadRecord(record)
      ? bindAssignmentReadExecution(context, record.request, record.id)
      : bindAssignmentWriteExecution(context, record.request, record.id);
    if (
      record.binding !== current.binding ||
      record.binding !==
        governanceDigest({ request: record.request, execution })
    )
      throw new AssignmentExecutionError("claim");

    const now = Date.now();
    if (now + execution.timeoutMs > Date.parse(execution.expiresAt))
      throw new AssignmentExecutionError("claim");
    record.claimedAt = new Date(now).toISOString();
    save();
    return current.execution;
  });
  unusedClaims.set(claimed, governanceDigest(claimed));
  return claimed;
}

// Consumers can spend an issued Claim; only the transaction above can register one.
export function consumeIssuedAssignmentClaim(
  claimed: AuthorizedAssignmentExecution
): void {
  const issuedDigest = unusedClaims.get(claimed);
  unusedClaims.delete(claimed);
  if (!issuedDigest || issuedDigest !== governanceDigest(claimed))
    throw new AssignmentExecutionError("claim");
}
