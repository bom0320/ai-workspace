import { assertGovernedGitConfiguration } from "@/infrastructure/git/index.js";
import {
  agentDecisionSchema,
  validateDecisionEvidence,
} from "@/application/decision/index.js";
import { loadAssignmentReadContext } from "./load-assignment-read-context.js";
import type { GovernanceLedger } from "../../../../model/ledger.js";
import { randomUUID } from "node:crypto";
import { governanceDigest } from "@/services/governance-records/index.js";
import {
  AssignmentExecutionError,
  assignmentExecutionRequestSchema,
  authorizedAssignmentReadExecutionSchema,
} from "../../../../model/assignment-execution.js";
import { withGovernanceLedger } from "../../../../records/governance-transaction.js";
import { resolvePreparedAssignmentPlan } from "../../../../records/assignment-plans/assignment-plan-records.js";
import type { Handoff } from "../../../../records/assignment-plans/resolve-assignment-context.js";
import {
  assertAssignmentReadDependencies,
  bindAssignmentReadExecution,
  resolveAssignmentExecution,
} from "./resolve-assignment-execution.js";

export function reserveAssignmentExecution(handoff: Handoff, input: unknown) {
  const request = assignmentExecutionRequestSchema.parse(input);
  return withGovernanceLedger((ledger, save) => {
    const context = resolveAssignmentExecution(ledger, handoff, request);
    assertAssignmentReadDependencies(context);
    if (request.access !== "read")
      throw new AssignmentExecutionError("unsupported");
    const { entry, delegation, policy, assignment } = context;
    const prior = entry.assignmentExecutions ?? [];
    const workReservations = entry.executionReservations ?? [];
    if (
      prior.some(({ request: reserved, delegationId }) => {
        if (delegationId !== delegation.id) return false;
        if (reserved.planId === request.planId)
          return (
            reserved.assignmentId === request.assignmentId &&
            reserved.access === request.access
          );
        return entry.assignmentPlans?.some(
          (plan) =>
            plan.id === reserved.planId &&
            plan.assignments.some(
              (item) =>
                item.id === reserved.assignmentId &&
                item.workItemId === assignment.workItemId
            )
        );
      }) ||
      workReservations.some(
        ({ sourceId, delegationId }) =>
          delegationId === delegation.id &&
          entry.workItemExecutionSources?.some(
            (source) =>
              source.id === sourceId &&
              source.workItemId === assignment.workItemId
          )
      )
    )
      throw new AssignmentExecutionError("duplicate");

    const count = [...prior, ...workReservations].filter(
      ({ delegationId }) => delegationId === delegation.id
    ).length;
    if (
      count >=
      Math.min(
        policy.budget.maxExecutions,
        delegation.grant.budget.maxExecutions
      )
    )
      throw new AssignmentExecutionError("budget");

    const now = Date.now();
    if (now + request.timeoutMs > Date.parse(delegation.grant.expiresAt))
      throw new AssignmentExecutionError("authority");

    const id = randomUUID();
    const { execution, binding } = bindAssignmentReadExecution(
      context,
      request,
      id
    );
    (entry.assignmentExecutions ??= []).push({
      id,
      delegationId: delegation.id,
      request,
      execution,
      binding,
      reservedAt: new Date(now).toISOString(),
    });
    save();
    return execution;
  });
}

// A persisted Claim alone cannot start a new context session. Only the object
// returned by a successful transaction in this process can be consumed.
const unusedClaims = new WeakMap<object, string>();

export function claimAssignmentExecution(handoff: Handoff, input: unknown) {
  const execution = authorizedAssignmentReadExecutionSchema.parse(input);
  const claimed = withGovernanceLedger((ledger, save) => {
    const { entry } = resolvePreparedAssignmentPlan(
      ledger,
      handoff,
      execution.planId
    );
    const record = entry.assignmentExecutions?.find(
      (value) =>
        value.id === execution.id && value.request.planId === execution.planId
    );
    if (!record || record.claimedAt || record.failure)
      throw new AssignmentExecutionError("claim");

    const context = resolveAssignmentExecution(ledger, handoff, record.request);
    assertAssignmentReadDependencies(context);
    const current = bindAssignmentReadExecution(
      context,
      record.request,
      record.id
    );
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

export function consumeAssignmentReadContext(
  handoff: Handoff,
  claimed: ReturnType<typeof claimAssignmentExecution>
) {
  const issuedDigest = unusedClaims.get(claimed);
  unusedClaims.delete(claimed);
  if (!issuedDigest || issuedDigest !== governanceDigest(claimed))
    throw new AssignmentExecutionError("claim");
  const permit = authorizedAssignmentReadExecutionSchema.parse(claimed);
  const trustedHandoff = structuredClone(handoff);
  const resolveLiveClaim = (ledger: GovernanceLedger) => {
    assertGovernedGitConfiguration(
      permit.snapshot.repositoryRoot,
      Math.min(permit.timeoutMs, 5000),
      "read-only"
    );
    const { entry } = resolvePreparedAssignmentPlan(
      ledger,
      trustedHandoff,
      permit.planId
    );
    const record = entry.assignmentExecutions?.find(
      ({ id }) => id === permit.id
    );
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
    const resolved = resolveAssignmentExecution(
      ledger,
      trustedHandoff,
      record.request
    );
    assertAssignmentReadDependencies(resolved);
    const { binding } = bindAssignmentReadExecution(
      resolved,
      record.request,
      record.id
    );
    if (
      record.binding !== binding ||
      binding !==
        governanceDigest({ request: record.request, execution: permit })
    )
      throw new AssignmentExecutionError("claim");
    return { record, resolved, deadlineMs, remainingTime };
  };

  const { context, specialist, deadlineMs } = withGovernanceLedger((ledger) => {
    const { resolved, deadlineMs, remainingTime } = resolveLiveClaim(ledger);
    const context = loadAssignmentReadContext(
      resolved,
      permit.readScopes,
      remainingTime
    );
    return { context, specialist: resolved.specialist, deadlineMs };
  });
  const contextDigest = governanceDigest(context);
  let finalized = false;
  return {
    context: structuredClone(context),
    specialist,
    authority: permit.authority,
    deadlineMs,
    recordResult(input: unknown) {
      if (finalized) throw new AssignmentExecutionError("claim");
      finalized = true;
      const decision = agentDecisionSchema.parse(input);
      if (decision.specialistId !== permit.specialistId)
        throw new AssignmentExecutionError("validation");
      try {
        validateDecisionEvidence(context, decision);
      } catch {
        throw new AssignmentExecutionError("validation");
      }
      return withGovernanceLedger((ledger, save) => {
        const { record, remainingTime } = resolveLiveClaim(ledger);
        const resultDigest = governanceDigest({
          id: record.id,
          binding: record.binding,
          decision,
          contextDigest,
        });
        record.result = { decision, contextDigest, digest: resultDigest };
        remainingTime();
        save();
        return { invocationId: record.id, resultDigest };
      });
    },
  };
}
