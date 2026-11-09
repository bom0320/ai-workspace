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

// Invocation Attempt

// Process-local Harness identity.
// Reuse the same handle for an explicit retry.
// Copied or serialized objects cannot mint a trusted ID.

export type InvocationAttempt = Readonly<{
  invocationId: string;
}>;

const attempts = new WeakSet<InvocationAttempt>();

export function createInvocationAttempt(): InvocationAttempt {
  const attempt = Object.freeze({
    invocationId: `invocation-${randomUUID()}`,
  });

  attempts.add(attempt);

  return attempt;
}

// Authorization

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
    // 1. Validate Invocation Request and Attempt

    const request = invokeSpecialistRequestSchema.parse(input);

    if (!attempts.has(attempt)) {
      return denied();
    }

    return withGovernanceLedger((ledger, save) => {
      const entries = Object.values(ledger.repositories);

      // 2. Check Duplicate Invocation Attempt

      if (
        entries.some((entry) =>
          entry.reservations?.some(
            ({ invocationId }) => invocationId === attempt.invocationId
          )
        )
      ) {
        return denied();
      }

      // 3. Find Approved Scope

      const matches = entries.flatMap((entry) =>
        entry.issuances
          .filter(({ scope }) => scope.id === request.scopeId)
          .map((issuance) => ({ entry, issuance }))
      );

      if (matches.length !== 1) {
        return denied();
      }

      const { entry, issuance } = matches[0];
      const { scope } = issuance;

      // 4. Validate Repository and Stored Issuance

      resolveGovernanceRepository(scope.snapshot.repositoryRoot);

      const files = validateStoredIssuance(issuance, entry);

      // 5. Calculate Invocation Usage

      const usedAgentInvocations = (entry.reservations ?? []).filter(
        (reservation) =>
          reservation.scopeId === scope.id &&
          reservation.scopeVersion === scope.version
      ).length;

      // Only authenticated and currently valid issuances reach "active".
      // A separate persisted Scope revocation model does not exist yet.

      const facts = {
        scopeStatus: "active" as const,
        usedAgentInvocations,
      };

      // 6. Evaluate Invocation Eligibility

      if (
        evaluateInvocationRequest(request, scope, facts).status !== "eligible"
      ) {
        return denied();
      }

      // 7. Resolve Approved Assignment and Specialist

      const assignment = scope.assignments.find(
        ({ assignmentId }) => assignmentId === request.assignmentId
      )!;

      const system = requireCurrentSystemPolicy(
        entry.systems.at(-1)!.configuration
      );

      const specialist = system.availableSpecialists.find(
        ({ id }) => id === assignment.specialistId
      );

      // 8. Select Approved Context Files

      const selectedFiles = request.requestedContextPaths.map((path) => {
        const file = files.find((file) => file.path === path);

        if (!file) {
          throw new Error("Missing validated Snapshot content.");
        }

        return file;
      });

      // 9. Build Authorized Invocation

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

      // 10. Validate Execution Context Budget

      // The actual execution envelope has its own size limit.
      // Proposal validation uses a different payload.

      if (
        Buffer.byteLength(JSON.stringify(invocation), "utf8") >
        system.limits.maxContextBytes
      ) {
        return denied();
      }

      // 11. Revalidate Context and Eligibility

      const currentFiles = validateStoredIssuance(issuance, entry);

      if (
        governanceDigest(selectedFiles) !==
        governanceDigest(
          request.requestedContextPaths.map((path) =>
            currentFiles.find((file) => file.path === path)
          )
        )
      ) {
        return denied();
      }

      if (
        evaluateInvocationRequest(request, scope, facts).status !== "eligible"
      ) {
        return denied();
      }

      // 12. Create Invocation Reservation

      const reservation = invocationReservationSchema.parse({
        invocationId: invocation.invocationId,
        scopeId: scope.id,
        scopeVersion: scope.version,
        assignmentId: assignment.assignmentId,
        requestDigest: governanceDigest(request),
        invocationDigest: governanceDigest(invocation),
        reservedAt: new Date(Date.now()).toISOString(),
      });

      // 13. Persist Reservation

      (entry.reservations ??= []).push(reservation);

      save();

      // 14. Return Authorized Invocation

      return {
        status: "allowed",
        invocation,
      };
    });
  } catch {
    return denied();
  }
}
