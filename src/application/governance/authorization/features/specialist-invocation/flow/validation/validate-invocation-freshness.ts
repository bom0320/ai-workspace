import type { InspectedFile } from "@/contracts/repository/inspected-file.js";
import { governanceDigest } from "@/services/governance-records/index.js";
import { validateStoredIssuance } from "../../../../../approval/index.js";
import type {
  InvokeSpecialistRequest,
  AuthorizedSpecialistInvocation,
} from "../../../../../model/authority.js";
import type { AuthorizationContext } from "../context/resolve-authorization-context.js";
import { evaluateInvocationRequest } from "./evaluate-invocation.js";

// Revalidate approval, Snapshot content, and invocation eligibility.
export function validateInvocationFreshness(
  { issuance, entry, facts }: AuthorizationContext,
  request: InvokeSpecialistRequest,
  invocation: AuthorizedSpecialistInvocation
): void {
  const currentFiles = validateStoredIssuance(issuance, entry);

  validateInvocationContext(
    invocation,
    request.requestedContextPaths,
    currentFiles
  );

  const eligibility = evaluateInvocationRequest(request, issuance.scope, facts);

  if (eligibility.status !== "eligible") {
    throw new Error("Invocation is no longer eligible.");
  }
}

// Ensure issued files match the validated Snapshot content.
export function validateInvocationContext(
  invocation: AuthorizedSpecialistInvocation,
  requestedContextPaths: string[],
  currentFiles: InspectedFile[]
): void {
  const expectedFiles = requestedContextPaths.map((path) => {
    const file = currentFiles.find((file) => file.path === path);

    if (!file) {
      throw new Error("Requested Snapshot file is missing.");
    }

    return file;
  });

  const issuedDigest = governanceDigest(invocation.files);
  const expectedDigest = governanceDigest(expectedFiles);

  if (issuedDigest !== expectedDigest) {
    throw new Error("Validated Snapshot content changed.");
  }
}
