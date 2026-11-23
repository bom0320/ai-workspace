import { randomUUID } from "node:crypto";
import { governanceDigest } from "@/services/governance-records/index.js";
import { withGovernanceLedger } from "../../../../records/governance-transaction.js";
import {
  executionRequestSchema,
  type ExecutionAuthorizationVerdict,
} from "../model/execution.js";
import { resolveExecutionContext } from "./context/resolve-execution-context.js";
import { assertExecutionReservationAvailable } from "./validation/assert-execution-reservation-available.js";

export function checkExecutionEligibility(
  input: unknown
):
  | { status: "eligible" }
  | Exclude<ExecutionAuthorizationVerdict, { status: "authorized" }> {
  try {
    const request = executionRequestSchema.parse(input);
    return withGovernanceLedger((ledger) => {
      const evaluated = resolveExecutionContext(ledger, request);
      if (!evaluated)
        return {
          status: "approval-required",
          reason: "An explicit Execution Delegation is required.",
        };
      assertExecutionReservationAvailable(evaluated);
      return { status: "eligible" };
    });
  } catch {
    return {
      status: "denied",
      reason:
        "Execution request is invalid, stale, already reserved, or exceeds authority.",
    };
  }
}

// The durable use record survives even if the Worker never starts.
export function authorizeExecutionForRun(
  input: unknown
): ExecutionAuthorizationVerdict {
  try {
    return withGovernanceLedger((ledger, save) => {
      const request = executionRequestSchema.parse(input);
      const evaluated = resolveExecutionContext(ledger, request);
      if (!evaluated)
        return {
          status: "approval-required",
          reason: "An explicit Execution Delegation is required.",
        };
      const { entry, source } = evaluated;
      assertExecutionReservationAvailable(evaluated);
      const execution = { ...evaluated.execution, id: randomUUID() };
      const now = Date.now();
      if (now + request.timeoutMs > Date.parse(execution.expiresAt))
        throw new Error(
          "Execution delegation has insufficient time remaining."
        );
      const reservedAt = new Date(now).toISOString();
      (entry.executionReservations ??= []).push({
        id: execution.id,
        sourceId: source.id,
        delegationId: execution.delegationId,
        requestDigest: governanceDigest(execution.request),
        executionDigest: governanceDigest(execution),
        reservedAt,
        claimedAt: reservedAt,
      });
      save();
      return { status: "authorized", execution };
    });
  } catch {
    return {
      status: "denied",
      reason:
        "Execution request is invalid, stale, already reserved, exceeds authority, or could not be persisted.",
    };
  }
}
