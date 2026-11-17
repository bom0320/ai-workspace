import { validateInvocationContext } from "./validation/validate-invocation-freshness.js";
import { governanceDigest } from "@/services/governance-records/index.js";
import { validateStoredIssuance } from "../../../../approval/index.js";
import {
  resolveGovernanceRepository,
  withGovernanceLedger,
} from "../../../../records/governance-transaction.js";
import {
  authorizedSpecialistInvocationSchema,
  invokeSpecialistRequestSchema,
  type AuthorizedSpecialistInvocation,
} from "../../../../model/authority.js";

// A claim consumes this reservation once; it does not execute or record success.
export function claimAuthorizedInvocation(
  input: AuthorizedSpecialistInvocation
):
  | { status: "claimed"; invocation: AuthorizedSpecialistInvocation }
  | { status: "denied"; reason: string } {
  try {
    const invocation = authorizedSpecialistInvocationSchema.parse(input);
    return withGovernanceLedger((ledger, save) => {
      const entries = Object.values(ledger.repositories);
      const reservations = entries.flatMap((entry) =>
        (entry.reservations ?? [])
          .filter(
            ({ invocationId }) => invocationId === invocation.invocationId
          )
          .map((reservation) => ({ entry, reservation }))
      );
      if (reservations.length !== 1) throw new Error("Missing reservation.");
      const { entry, reservation } = reservations[0];
      const request = invokeSpecialistRequestSchema.parse({
        scopeId: invocation.scopeId,
        scopeVersion: invocation.scopeVersion,
        assignmentId: invocation.assignmentId,
        requestedContextPaths: invocation.files.map(({ path }) => path),
      });
      if (
        reservation.claimedAt !== undefined ||
        reservation.scopeId !== invocation.scopeId ||
        reservation.scopeVersion !== invocation.scopeVersion ||
        reservation.assignmentId !== invocation.assignmentId ||
        reservation.invocationDigest !== governanceDigest(invocation) ||
        reservation.requestDigest !== governanceDigest(request)
      )
        throw new Error("Reservation is claimed or its bindings differ.");

      const issuances = entries.flatMap((owner) =>
        owner.issuances
          .filter(({ scope }) => scope.id === invocation.scopeId)
          .map((issuance) => ({ owner, issuance }))
      );
      if (issuances.length !== 1) throw new Error("Scope is not unique.");
      const { owner, issuance } = issuances[0];
      if (owner !== entry || issuance.scope.version !== invocation.scopeVersion)
        throw new Error("Reservation Scope does not match.");
      resolveGovernanceRepository(issuance.scope.snapshot.repositoryRoot);
      const files = validateStoredIssuance(issuance, entry);
      validateInvocationContext(
        invocation,
        request.requestedContextPaths,
        files
      );

      // No eligibility evaluation: budget was already consumed at reservation.
      reservation.claimedAt = new Date(Date.now()).toISOString();
      save();
      return { status: "claimed", invocation };
    });
  } catch {
    return {
      status: "denied",
      reason:
        "Invocation claim denied: missing, mismatched, stale or already claimed reservation, or persistence failure.",
    };
  }
}
