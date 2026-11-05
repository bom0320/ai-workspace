import {
  contextAccessPolicySchema,
  type ContextAccessPolicy,
  type PathScope,
} from "@/contracts/repository/context-access-policy.js";
import { isUnambiguousRepositoryPath } from "./discovery.js";

// Validate the single current operating contract; historical conversion belongs
// to the signed-record reader, never to discovery or access enforcement.
export function validateContextAccessPolicy(
  input: unknown
): ContextAccessPolicy {
  const policy = contextAccessPolicySchema.parse(input);
  if (
    policy.allowedScopes.some(({ path }) => !isUnambiguousRepositoryPath(path))
  )
    throw new Error("Invalid Harness Context access scope path.");
  return policy;
}

export function isContextPathAllowed(
  path: string,
  policy: ContextAccessPolicy
): boolean {
  if (!isUnambiguousRepositoryPath(path)) return false;
  return policy.allowedScopes.some(
    (scope) =>
      isUnambiguousRepositoryPath(scope.path) &&
      (scope.kind === "file"
        ? path === scope.path
        : path.startsWith(`${scope.path}/`))
  );
}

// Directory scopes require a containing directory, not a finite set of files.
export function isContextScopeContained(
  scope: PathScope,
  policy: ContextAccessPolicy
): boolean {
  if (!isUnambiguousRepositoryPath(scope.path)) return false;
  if (scope.kind === "file") return isContextPathAllowed(scope.path, policy);
  return policy.allowedScopes.some(
    (parent) =>
      parent.kind === "directory" &&
      isUnambiguousRepositoryPath(parent.path) &&
      (scope.path === parent.path || scope.path.startsWith(`${parent.path}/`))
  );
}
