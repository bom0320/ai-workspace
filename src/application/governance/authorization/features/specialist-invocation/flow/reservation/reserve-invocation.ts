import { governanceDigest } from "@/services/governance-records/index.js";
import type {
  InvokeSpecialistRequest,
  AuthorizedSpecialistInvocation,
} from "../../../../../model/authority.js";
import { invocationReservationSchema } from "../../model/reservation.js";
import type { AuthorizationContext } from "../context/resolve-authorization-context.js";

// Append only within the caller's existing transaction. The caller owns save().
export function reserveInvocation(
  { entry, issuance: { scope }, assignment }: AuthorizationContext,
  request: InvokeSpecialistRequest,
  invocation: AuthorizedSpecialistInvocation
): void {
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
}
