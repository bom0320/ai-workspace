export type ScopeCheckResult = {
  passed: boolean;
  violations: string[];
};

export function checkScope(
  changedPaths: string[],
  allowedPaths: string[],
  forbiddenPaths: string[],
): ScopeCheckResult {
  const allowed = new Set(allowedPaths);
  const forbidden = new Set(forbiddenPaths);
  const violations = [
    ...new Set(
      changedPaths.filter(
        (path) => forbidden.has(path) || !allowed.has(path),
      ),
    ),
  ].sort();

  return {
    passed: violations.length === 0,
    violations,
  };
}
