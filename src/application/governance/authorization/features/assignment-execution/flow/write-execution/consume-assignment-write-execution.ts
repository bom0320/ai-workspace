import type { GovernanceLedger } from "../../../../../model/ledger.js";
import type { Handoff } from "../../../../../records/assignment-plans/prepare-assignment-context.js";
import {
  AssignmentExecutionError,
  authorizedAssignmentWriteExecutionSchema,
  assignmentWriteResultSchema,
  digestAssignmentWriteResult,
  type AssignmentWriteRecord,
  type AuthorizedAssignmentExecution,
} from "../../../../../model/assignment-execution.js";
import { withGovernanceLedger } from "../../../../../records/governance-transaction.js";
import { consumeIssuedAssignmentClaim } from "../claim/claim-assignment-execution.js";
import { resolveLiveWriteClaim } from "./resolve-live-write-claim.js";

export function consumeAssignmentWriteExecution(
  handoff: Handoff,
  claim: AuthorizedAssignmentExecution
) {
  consumeIssuedAssignmentClaim(claim);
  const permit = authorizedAssignmentWriteExecutionSchema.parse(claim);
  const trustedHandoff = structuredClone(handoff);
  const resolve = (ledger: GovernanceLedger) =>
    resolveLiveWriteClaim(ledger, trustedHandoff, permit);
  const { task, deadline, workItemId } = withGovernanceLedger(resolve);
  let finalized = false;
  const execution = {
    task,
    workItemId,
    specialistId: permit.specialistId,
    snapshot: permit.snapshot,
    expiresAt: new Date(deadline).toISOString(),
    timeoutMs: deadline - Date.now(),
    recordResult(
      input: Omit<NonNullable<AssignmentWriteRecord["result"]>, "digest">
    ) {
      if (finalized) throw new AssignmentExecutionError("claim");
      finalized = true;
      return withGovernanceLedger((ledger, save) => {
        const { record } = resolve(ledger);
        const digest = digestAssignmentWriteResult(record, input);
        record.result = assignmentWriteResultSchema.parse({ ...input, digest });
        save();
        return { invocationId: record.id, resultDigest: digest };
      });
    },
  };
  pendingTaskExecutions.set(
    execution,
    structuredClone({
      task: execution.task,
      snapshot: execution.snapshot,
      timeoutMs: execution.timeoutMs,
      expiresAt: execution.expiresAt,
    })
  );
  return execution;
}

type TaskExecutionInput = Pick<
  ReturnType<typeof consumeAssignmentWriteExecution>,
  "task" | "snapshot" | "timeoutMs" | "expiresAt"
>;
const pendingTaskExecutions = new WeakMap<object, TaskExecutionInput>();

// Only the process-local object produced by consuming the Write claim can
// supply a task, and the registered snapshot of its data is authoritative.
export function takeAssignmentTaskExecution(
  execution: TaskExecutionInput
): TaskExecutionInput {
  const approved = pendingTaskExecutions.get(execution);
  pendingTaskExecutions.delete(execution);
  if (!approved || Date.parse(approved.expiresAt) <= Date.now())
    throw new AssignmentExecutionError("claim");
  return approved;
}
