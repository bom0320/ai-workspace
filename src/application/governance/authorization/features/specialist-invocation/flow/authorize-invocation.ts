import { withGovernanceLedger } from "../../../../records/governance-transaction.js";
import {
  invokeSpecialistRequestSchema,
  type AuthorityVerdict,
} from "../../../../model/authority.js";
import {
  createInvocationAttempt,
  assertTrustedInvocationAttempt,
  type InvocationAttempt,
} from "../model/invocation-attempt.js";
import { resolveAuthorizationContext } from "./context/resolve-authorization-context.js";
import { buildAuthorizedInvocation } from "./transformation/build-authorized-invocation.js";
import { validateInvocationFreshness } from "./validation/validate-invocation-freshness.js";
import { reserveInvocation } from "./reservation/reserve-invocation.js";

export function authorizeSpecialistInvocation(
  input: unknown,
  attempt: InvocationAttempt = createInvocationAttempt()
): AuthorityVerdict {
  try {
    const request = invokeSpecialistRequestSchema.parse(input);
    assertTrustedInvocationAttempt(attempt);

    return withGovernanceLedger((ledger, save) => {
      const context = resolveAuthorizationContext(ledger, request, attempt);
      const invocation = buildAuthorizedInvocation(context, request, attempt);
      validateInvocationFreshness(context, request, invocation);
      reserveInvocation(context, request, invocation);
      save();
      return { status: "allowed", invocation };
    });
  } catch {
    return {
      status: "denied",
      reason:
        "Invocation denied: invalid request, untrusted or stale Scope, duplicate attempt, unavailable Context or exhausted budget.",
    };
  }
}
