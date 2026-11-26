import type { PathScope } from "@/contracts/repository/context-access-policy.js";
import { isContextScopeContained } from "@/services/repository-inspection/index.js";
import { executionScopes } from "../../../../../approval/features/system-policy/model/execution-system-policy.js";
import { AssignmentExecutionError } from "../../../../../model/assignment-execution.js";
import type { resolveLiveReadClaim } from "./resolve-live-read-claim.js";

export function checkWriteEligibility(
  { resolved, remainingTime }: ReturnType<typeof resolveLiveReadClaim>,
  readScopes: PathScope[]
) {
  const { entry, assignment, delegation, policy } = resolved;
  const { grant } = delegation;
  if (resolved.plan.writeDetailingVersion !== 1)
    throw new AssignmentExecutionError("legacy-write-plan");
  const permitted = executionScopes(policy).writeScopes;
  const granted = executionScopes(grant).writeScopes;
  const within = (
    scope: (typeof permitted)[number],
    allowedScopes: typeof permitted
  ) => isContextScopeContained(scope, { allowedScopes });
  const writeScopes = [
    ...granted.filter((scope) => within(scope, permitted)),
    ...permitted.filter((scope) => within(scope, granted)),
  ].filter(
    (scope, index, scopes) =>
      scopes.findIndex(
        ({ path, kind }) => path === scope.path && kind === scope.kind
      ) === index
  );
  if (
    assignment.repositoryAccessCeiling !== "write" ||
    !writeScopes.length ||
    grant.workerMode !== "codex-worktree" ||
    policy.workerMode !== "codex-worktree"
  )
    throw new AssignmentExecutionError("authority");
  const count = [
    ...(entry.executionReservations ?? []),
    ...(entry.assignmentExecutions ?? []),
  ].filter(({ delegationId }) => delegationId === delegation.id).length;
  if (
    count >= Math.min(grant.budget.maxExecutions, policy.budget.maxExecutions)
  )
    throw new AssignmentExecutionError("budget");
  remainingTime();
  return {
    readScopes,
    writeScopes,
    shellCommands: grant.shellCommands.filter((command) =>
      policy.shellCommands.includes(command)
    ),
    budget: {
      maxExecutions:
        Math.min(grant.budget.maxExecutions, policy.budget.maxExecutions) -
        count,
      maxTimeoutMs: Math.min(
        grant.budget.maxTimeoutMs,
        policy.budget.maxTimeoutMs,
        Date.parse(grant.expiresAt) - Date.now()
      ),
    },
  };
}
