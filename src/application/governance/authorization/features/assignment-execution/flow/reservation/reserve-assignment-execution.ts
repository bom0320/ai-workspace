import { randomUUID } from "node:crypto";
import { assignmentExecutionRequestSchema } from "../../../../../model/assignment-execution.js";
import { withGovernanceLedger } from "../../../../../records/governance-transaction.js";
import type { Handoff } from "../../../../../records/assignment-plans/prepare-assignment-context.js";
import {
  bindAssignmentReadExecution,
  bindAssignmentWriteExecution,
} from "../binding/bind-assignment-execution.js";
import {
  assertAssignmentReadDependencies,
  resolveAssignmentExecution,
} from "../context/resolve-assignment-execution.js";
import { validateReservationEligibility } from "./validate-reservation-eligibility.js";

export function reserveAssignmentExecution(handoff: Handoff, input: unknown) {
  const request = assignmentExecutionRequestSchema.parse(input);
  return withGovernanceLedger((ledger, save) => {
    const context = resolveAssignmentExecution(ledger, handoff, request);
    assertAssignmentReadDependencies(context);
    const { entry, delegation } = context;
    const now = validateReservationEligibility(context, request);

    const id = randomUUID();
    if (request.access === "write") {
      const { execution, binding } = bindAssignmentWriteExecution(
        context,
        request,
        id
      );
      (entry.assignmentExecutions ??= []).push({
        kind: "write",
        id,
        delegationId: delegation.id,
        request,
        execution,
        binding,
        reservedAt: new Date(now).toISOString(),
      });
      save();
      return execution;
    }
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
