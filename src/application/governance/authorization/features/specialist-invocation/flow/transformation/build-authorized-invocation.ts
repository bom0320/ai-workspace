import {
  authorizedSpecialistInvocationSchema,
  type InvokeSpecialistRequest,
} from "../../../../../model/authority.js";
import type { InvocationAttempt } from "../../model/invocation-attempt.js";
import type { AuthorizationContext } from "../context/resolve-authorization-context.js";

export function buildAuthorizedInvocation(
  { issuance: { scope }, assignment, system, files }: AuthorizationContext,
  request: InvokeSpecialistRequest,
  attempt: InvocationAttempt
) {
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
  // Bound the actual execution envelope, including Harness-issued IDs.
  if (
    Buffer.byteLength(JSON.stringify(invocation), "utf8") >
    system.limits.maxContextBytes
  )
    throw new Error("Invocation Context budget exceeded.");
  return invocation;
}
