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
  bindAssignmentReadExecution,
  resolveAssignmentExecution,
} from "./resolve-assignment-execution.js";

export function reserveAssignmentExecution(handoff: Handoff, input: unknown) {
  const request = assignmentExecutionRequestSchema.parse(input);
  return withGovernanceLedger((ledger, save) => {
    const context = resolveAssignmentExecution(ledger, handoff, request);
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

export function claimAssignmentExecution(handoff: Handoff, input: unknown) {
  const execution = authorizedAssignmentReadExecutionSchema.parse(input);
  return withGovernanceLedger((ledger, save) => {
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
    // This permit contains scope metadata only. Context access is not wired here.
    return current.execution;
  });
}
