import { governanceDigest } from "@/services/governance-records/index.js";
import { validateStoredIssuance } from "../../../../../approval/index.js";
import type {
  InvokeSpecialistRequest,
  AuthorizedSpecialistInvocation,
} from "../../../../../model/authority.js";
import type { AuthorizationContext } from "../context/resolve-authorization-context.js";
import { evaluateInvocationRequest } from "./evaluate-invocation.js";

export function validateInvocationFreshness(
  { issuance, entry, facts }: AuthorizationContext,
  request: InvokeSpecialistRequest,
  invocation: AuthorizedSpecialistInvocation
): void {
  const currentFiles = validateStoredIssuance(issuance, entry);
  if (
    governanceDigest(invocation.files) !==
    governanceDigest(
      request.requestedContextPaths.map((path) =>
        currentFiles.find((file) => file.path === path)
      )
    )
  )
    throw new Error("Validated Snapshot content changed.");
  if (
    evaluateInvocationRequest(request, issuance.scope, facts).status !==
    "eligible"
  )
    throw new Error("Invocation is no longer eligible.");
}
