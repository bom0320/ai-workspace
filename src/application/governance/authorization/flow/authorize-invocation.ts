import { randomUUID } from "node:crypto";
import { governanceDigest } from "@/services/governance-records/index.js";
import {
  validateStoredIssuance,
  requireCurrentSystemPolicy,
} from "../../approval/index.js";
import {
  withGovernanceLedger,
  resolveGovernanceRepository,
} from "../../records/governance-transaction.js";
import {
  invokeSpecialistRequestSchema,
  authorizedSpecialistInvocationSchema,
  type AuthorityVerdict,
} from "../../model/authority.js";
import { invocationReservationSchema } from "../model/reservation.js";
import { evaluateInvocationRequest } from "./evaluate-invocation.js";

// Process-local Harness identity, separate from CEO request data. Reuse this
// handle for an explicit retry; a copied/serialized object cannot mint an ID.
export type InvocationAttempt = Readonly<{ invocationId: string }>;
const attempts = new WeakSet<InvocationAttempt>();
export function createInvocationAttempt(): InvocationAttempt {
  const attempt = Object.freeze({ invocationId: `invocation-${randomUUID()}` });
  attempts.add(attempt);
  return attempt;
}

export function authorizeSpecialistInvocation(
  input: unknown,
  attempt: InvocationAttempt = createInvocationAttempt()
): AuthorityVerdict {
  const denied = (): AuthorityVerdict => ({
    status: "denied",
    reason:
      "Invocation denied: invalid request, untrusted or stale Scope, duplicate attempt, unavailable Context or exhausted budget.",
  });
  try {
    const request = invokeSpecialistRequestSchema.parse(input);
    if (!attempts.has(attempt)) return denied();
    return withGovernanceLedger((ledger, save) => {
      const entries = Object.values(ledger.repositories);
      if (
        entries.some((entry) =>
          entry.reservations?.some(
            ({ invocationId }) => invocationId === attempt.invocationId
          )
        )
      )
        return denied();
      const matches = entries.flatMap((entry) =>
        entry.issuances
          .filter(({ scope }) => scope.id === request.scopeId)
          .map((issuance) => ({ entry, issuance }))
      );
      if (matches.length !== 1) return denied();
      const { entry, issuance } = matches[0];
      const { scope } = issuance;
      resolveGovernanceRepository(scope.snapshot.repositoryRoot);
      const files = validateStoredIssuance(issuance, entry);
      const usedAgentInvocations = (entry.reservations ?? []).filter(
        (reservation) =>
          reservation.scopeId === scope.id &&
          reservation.scopeVersion === scope.version
      ).length;
      // Only an authenticated, currently valid stored issuance reaches "active".
      // No separate persisted Scope revocation model exists in this version.
      const facts = { scopeStatus: "active" as const, usedAgentInvocations };
      if (
        evaluateInvocationRequest(request, scope, facts).status !== "eligible"
      )
        return denied();
      const assignment = scope.assignments.find(
        ({ assignmentId }) => assignmentId === request.assignmentId
      )!;
      const system = requireCurrentSystemPolicy(
        entry.systems.at(-1)!.configuration
      );
      const specialist = system.availableSpecialists.find(
        ({ id }) => id === assignment.specialistId
      );
      const selectedFiles = request.requestedContextPaths.map((path) => {
        const file = files.find((file) => file.path === path);
        if (!file) throw new Error("Missing validated Snapshot content.");
        return file;
      });
      const invocation = authorizedSpecialistInvocationSchema.parse({
        invocationId: attempt.invocationId,
        scopeId: scope.id,
        scopeVersion: scope.version,
        assignmentId: assignment.assignmentId,
        assignmentObjective: assignment.objective,
        goal: scope.goal,
        snapshot: scope.snapshot,
        specialist,
        files: selectedFiles,
      });
      // Bound this actual execution envelope too; Proposal's validation envelope
      // is a different payload and excludes Harness-issued IDs.
      if (
        Buffer.byteLength(JSON.stringify(invocation), "utf8") >
        system.limits.maxContextBytes
      )
        return denied();
      const currentFiles = validateStoredIssuance(issuance, entry);
      if (
        governanceDigest(selectedFiles) !==
        governanceDigest(
          request.requestedContextPaths.map((path) =>
            currentFiles.find((file) => file.path === path)
          )
        )
      )
        return denied();
      if (
        evaluateInvocationRequest(request, scope, facts).status !== "eligible"
      )
        return denied();
      const reservation = invocationReservationSchema.parse({
        invocationId: invocation.invocationId,
        scopeId: scope.id,
        scopeVersion: scope.version,
        assignmentId: assignment.assignmentId,
        requestDigest: governanceDigest(request),
        invocationDigest: governanceDigest(invocation),
        reservedAt: new Date(Date.now()).toISOString(),
      });
      (entry.reservations ??= []).push(reservation);
      save();
      return { status: "allowed", invocation };
    });
  } catch {
    return denied();
  }
}
