import { assertGovernedGitConfiguration } from "@/infrastructure/git/index.js";
import { governanceDigest } from "@/services/governance-records/index.js";
import type { GovernanceLedger } from "../../../../../model/ledger.js";
import type { Handoff } from "../../../../../records/assignment-plans/prepare-assignment-context.js";
import { resolvePreparedAssignmentPlan } from "../../../../../records/assignment-plans/assignment-plan-records.js";
import {
  AssignmentExecutionError,
  isAssignmentReadRecord,
  type AuthorizedAssignmentExecution,
} from "../../../../../model/assignment-execution.js";
import { bindAssignmentReadExecution } from "../binding/bind-assignment-execution.js";
import {
  assertAssignmentReadDependencies,
  resolveAssignmentBinding,
} from "../context/resolve-assignment-execution.js";

export function resolveLiveReadClaim(
  ledger: GovernanceLedger,
  trustedHandoff: Handoff,
  permit: Extract<AuthorizedAssignmentExecution, { access: "read" }>
) {
  assertGovernedGitConfiguration(
    permit.snapshot.repositoryRoot,
    Math.min(permit.timeoutMs, 5000),
    "read-only"
  );
  const prepared = resolvePreparedAssignmentPlan(
    ledger,
    trustedHandoff,
    permit.planId
  );
  const record = prepared.entry.assignmentExecutions
    ?.filter(isAssignmentReadRecord)
    .find(({ id }) => id === permit.id);
  if (!record?.claimedAt || record.failure || record.result)
    throw new AssignmentExecutionError("claim");
  const deadlineMs = Math.min(
    Date.parse(record.claimedAt) + permit.timeoutMs,
    Date.parse(permit.expiresAt)
  );
  const remainingTime = () => {
    const time = deadlineMs - Date.now();
    if (time < 1) throw new AssignmentExecutionError("claim");
    return time;
  };
  remainingTime();
  const resolved = resolveAssignmentBinding(prepared, record.request);
  assertAssignmentReadDependencies(resolved);
  const { binding } = bindAssignmentReadExecution(
    resolved,
    record.request,
    record.id
  );
  if (
    record.binding !== binding ||
    binding !== governanceDigest({ request: record.request, execution: permit })
  )
    throw new AssignmentExecutionError("claim");
  return { record, resolved, deadlineMs, remainingTime };
}
