import { z } from "zod";
import {
  contextAccessPolicySchema,
  type ContextAccessPolicy,
  type PathScope,
} from "@/contracts/repository/context-access-policy.js";
import { isUnambiguousRepositoryPath } from "./discovery.js";

// Legacy paths are exact files forever; never infer directories from Git or FS.
// Empty legacy defaults coexist with a new policy, but two populated policies
// are ambiguous and must not silently union or replace one another.
export function resolveContextAccessPolicy(input: {
  contextAccessPolicy?: ContextAccessPolicy;
  allowedContextPaths?: string[];
}): ContextAccessPolicy {
  const legacy = z
    .array(z.string().min(1))
    .parse(input.allowedContextPaths ?? []);
  if (input.contextAccessPolicy !== undefined && legacy.length)
    throw new Error("Specify Context scopes or legacy file paths, not both.");
  const policy = contextAccessPolicySchema.parse(
    input.contextAccessPolicy === undefined
      ? {
          allowedScopes: legacy.map((path) => ({ kind: "file", path })),
        }
      : input.contextAccessPolicy
  );
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
