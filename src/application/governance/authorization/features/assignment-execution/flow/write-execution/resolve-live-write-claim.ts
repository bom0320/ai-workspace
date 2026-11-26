import { governanceDigest } from "@/services/governance-records/index.js";
import type { GovernanceLedger } from "../../../../../model/ledger.js";
import type { Handoff } from "../../../../../records/assignment-plans/prepare-assignment-context.js";
import { resolvePreparedAssignmentPlan } from "../../../../../records/assignment-plans/assignment-plan-records.js";
import {
  AssignmentExecutionError,
  isAssignmentReadRecord,
  type AuthorizedAssignmentExecution,
} from "../../../../../model/assignment-execution.js";
import { bindAssignmentWriteExecution } from "../binding/bind-assignment-execution.js";
import {
  assertAssignmentReadDependencies,
  resolveAssignmentBinding,
} from "../context/resolve-assignment-execution.js";

export function resolveLiveWriteClaim(
  ledger: GovernanceLedger,
  trustedHandoff: Handoff,
  permit: Extract<AuthorizedAssignmentExecution, { access: "write" }>
) {
  const prepared = resolvePreparedAssignmentPlan(
    ledger,
    trustedHandoff,
    permit.planId
  );
  const record = prepared.entry.assignmentExecutions?.find(
    ({ id }) => id === permit.id
  );
  if (
    !record?.claimedAt ||
    isAssignmentReadRecord(record) ||
    record.result ||
    record.failure
  )
    throw new AssignmentExecutionError("claim");
  const context = resolveAssignmentBinding(prepared, record.request);
  assertAssignmentReadDependencies(context);
  const current = bindAssignmentWriteExecution(
    context,
    record.request,
    record.id
  );
  const deadline = Math.min(
    Date.parse(record.claimedAt) + permit.timeoutMs,
    Date.parse(permit.expiresAt)
  );
  if (
    record.binding !== current.binding ||
    record.binding !==
      governanceDigest({ request: record.request, execution: permit }) ||
    deadline <= Date.now()
  )
    throw new AssignmentExecutionError("claim");
  return {
    record,
    task: current.task,
    deadline,
    workItemId: context.workItem.id,
  };
}
