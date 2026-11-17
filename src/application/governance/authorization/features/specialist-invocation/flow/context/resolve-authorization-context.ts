import type { GovernanceLedger } from "../../../../../model/ledger.js";
import type { InvokeSpecialistRequest } from "../../../../../model/authority.js";
import {
  validateStoredIssuance,
  requireCurrentSystemPolicy,
} from "../../../../../approval/index.js";
import { resolveGovernanceRepository } from "../../../../../records/governance-transaction.js";
import type { InvocationAttempt } from "../../model/invocation-attempt.js";
import { evaluateInvocationRequest } from "../validation/evaluate-invocation.js";

export function resolveAuthorizationContext(
  ledger: GovernanceLedger,
  request: InvokeSpecialistRequest,
  attempt: InvocationAttempt
) {
  const entries = Object.values(ledger.repositories);
  if (
    entries.some((entry) =>
      entry.reservations?.some(
        ({ invocationId }) => invocationId === attempt.invocationId
      )
    )
  )
    throw new Error("Duplicate Invocation attempt.");

  const matches = entries.flatMap((entry) =>
    entry.issuances
      .filter(({ scope }) => scope.id === request.scopeId)
      .map((issuance) => ({ entry, issuance }))
  );
  if (matches.length !== 1) throw new Error("Approved Scope is not unique.");
  const { entry, issuance } = matches[0];
  const { scope } = issuance;
  resolveGovernanceRepository(scope.snapshot.repositoryRoot);
  const files = validateStoredIssuance(issuance, entry);
  const usedAgentInvocations = (entry.reservations ?? []).filter(
    (reservation) =>
      reservation.scopeId === scope.id &&
      reservation.scopeVersion === scope.version
  ).length;
  // Only authenticated and currently valid issuances reach active.
  // A separate persisted Scope revocation model does not exist yet.
  const facts = { scopeStatus: "active" as const, usedAgentInvocations };
  if (evaluateInvocationRequest(request, scope, facts).status !== "eligible")
    throw new Error("Invocation is not eligible.");

  const assignment = scope.assignments.find(
    ({ assignmentId }) => assignmentId === request.assignmentId
  )!;
  const system = requireCurrentSystemPolicy(
    entry.systems.at(-1)!.configuration
  );
  return { entry, issuance, files, facts, assignment, system };
}

// Internal facts obtained inside the current Ledger transaction, never CEO data.
export type AuthorizationContext = ReturnType<
  typeof resolveAuthorizationContext
>;
