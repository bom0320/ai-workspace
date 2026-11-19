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
import {
  remainingAnalysisBudget,
  requireRefinementRequest,
  requireAnalysisRoot,
} from "./validation/validate-analysis-refinement.js";
import { validateStoredIssuance } from "../../../../approval/index.js";
import { governanceDigest } from "@/services/governance-records/index.js";

export function authorizeSpecialistInvocation(
  input: unknown,
  attempt: InvocationAttempt = createInvocationAttempt(),
  refinementId?: string
): AuthorityVerdict {
  try {
    const request = invokeSpecialistRequestSchema.parse(input);
    assertTrustedInvocationAttempt(attempt);

    return withGovernanceLedger((ledger, save) => {
      const context = resolveAuthorizationContext(ledger, request, attempt);
      const { entry, issuance } = context;
      const linkage = issuance.proposal.refinement;
      const rootScopeId = linkage?.rootScopeId ?? issuance.scope.id;
      if (remainingAnalysisBudget(entry, rootScopeId) <= 0)
        throw new Error("Cumulative analysis budget is exhausted.");
      if (linkage && !refinementId)
        throw new Error("A supplemental Scope requires a refinement round.");
      if (refinementId) {
        requireRefinementRequest(entry, rootScopeId, refinementId, request);
        const root = requireAnalysisRoot(entry, rootScopeId);
        if (root !== issuance) validateStoredIssuance(root, entry);
        if (
          entry.reservations?.some(
            (record) =>
              record.analysisRefinementId === refinementId &&
              record.requestDigest === governanceDigest(request)
          )
        )
          throw new Error("Refinement request already reserved.");
      }
      const invocation = buildAuthorizedInvocation(context, request, attempt);
      validateInvocationFreshness(context, request, invocation);
      reserveInvocation(context, request, invocation, refinementId);
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
