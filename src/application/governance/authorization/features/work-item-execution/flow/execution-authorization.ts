import { randomUUID } from "node:crypto";
import { lstatSync, realpathSync } from "node:fs";
import { join } from "node:path";
import { listRepositoryFilesAtCommit } from "@/infrastructure/git/index.js";
import { governanceDigest } from "@/services/governance-records/index.js";
import { assertRepositoryMatchesSnapshot } from "@/services/repository-snapshot/index.js";
import { resolveApprovedDecision } from "../../../../approval/features/direction-review/flow/approved-decision.js";
import {
  executionDelegationId,
  isExecutionGrantWithinPolicy,
} from "../../../../approval/features/execution-delegation/validation/validate-execution-delegation-records.js";
import {
  executionScopes,
  isExecutionScopeContained,
} from "../../../../approval/features/system-policy/model/execution-system-policy.js";
import type { GovernanceLedger } from "../../../../model/ledger.js";
import {
  resolveGovernanceRepository,
  withGovernanceLedger,
} from "../../../../records/governance-transaction.js";
import {
  executionRequestSchema,
  type ExecutionAuthorizationVerdict,
  type ExecutionRequest,
} from "../model/execution.js";
import { validateTaskExecutionContract } from "./validation/validate-task-execution-contract.js";

function evaluateExecution(
  ledger: GovernanceLedger,
  request: ExecutionRequest
) {
  const { entry, decision, context, snapshot } = resolveApprovedDecision(
    ledger,
    request.approvedDecisionId
  );
  const repositoryPath = resolveGovernanceRepository(request.repositoryPath);
  if (
    repositoryPath !== snapshot.repositoryRoot ||
    request.task.targetRepository !== context.goal.targetRepository
  )
    throw new Error("Execution Repository mismatch.");

  const delegation = entry.executionDelegations?.find(
    ({ id }) => id === executionDelegationId(decision.id)
  );
  if (!delegation) return undefined;
  const policy = entry.executionPolicies?.at(-1);
  if (
    !policy?.policy ||
    policy.version !== delegation.grant.policyVersion ||
    delegation.repositoryRoot !== repositoryPath
  )
    throw new Error("Execution policy or delegation changed.");

  const source = entry.workItemExecutionSources?.find(
    ({ id }) => id === request.executionSourceId
  );
  const decomposition = entry.executionDecompositions?.find(
    ({ binding }) => binding === source?.decompositionBinding
  );
  const workItem = decomposition?.workItems.find(
    ({ id }) => id === source?.workItemId
  );
  if (
    !source ||
    decomposition?.approvedDecisionId !== decision.id ||
    decomposition.approvalBinding !== governanceDigest(decision) ||
    governanceDigest(source.snapshot) !== governanceDigest(snapshot) ||
    source.taskDigest !== governanceDigest(request.task) ||
    !workItem ||
    governanceDigest(workItem) !== governanceDigest(request.workItem) ||
    workItem.dependsOn.length
  )
    throw new Error("Unverified Work Item, dependencies or TaskContract.");

  const { readPaths, timeoutMs, task } = request;
  const { writePaths, shellCommands } = validateTaskExecutionContract(
    task,
    delegation.grant
  );
  if (
    !(context.goal.constraints ?? []).every((constraint) =>
      task.constraints.includes(constraint)
    )
  )
    throw new Error("Task must preserve the approved Goal constraints.");

  const requestedGrant = {
    readPaths,
    writePaths,
    shellCommands,
    budget: { maxExecutions: 1, maxTimeoutMs: timeoutMs },
    expiresAt: delegation.grant.expiresAt,
    policyVersion: policy.version,
  };
  if (
    !isExecutionScopeContained(
      {
        readScopes: executionScopes(requestedGrant).readScopes,
        writeScopes: [],
      },
      executionScopes(delegation.grant)
    ) ||
    timeoutMs > delegation.grant.budget.maxTimeoutMs ||
    !isExecutionGrantWithinPolicy(
      requestedGrant,
      policy.policy,
      Date.parse(delegation.issuedAt)
    )
  )
    throw new Error("Execution exceeds the policy or delegation.");

  assertRepositoryMatchesSnapshot(snapshot);
  const files = new Set(
    listRepositoryFilesAtCommit(repositoryPath, snapshot.commitSha)
      .filter(({ mode }) => mode === "100644" || mode === "100755")
      .map(({ path }) => path)
  );
  if (
    ![...new Set([...readPaths, ...writePaths])].every((path) => {
      if (!files.has(path)) return false;
      const absolutePath = join(repositoryPath, path);
      return (
        lstatSync(absolutePath).isFile() &&
        realpathSync(absolutePath) === absolutePath
      );
    })
  )
    throw new Error("Execution scope must identify tracked regular files.");
  if (Date.now() + timeoutMs > Date.parse(delegation.grant.expiresAt))
    throw new Error(
      "Execution delegation expired or remaining time is insufficient."
    );

  return {
    entry,
    source,
    maxExecutions: Math.min(
      policy.policy.budget.maxExecutions,
      delegation.grant.budget.maxExecutions
    ),
    execution: {
      request: { ...request, repositoryPath },
      snapshot,
      delegationId: delegation.id,
      delegationBinding: governanceDigest(delegation),
      policyVersion: policy.version,
      policyBinding: policy.binding,
      expiresAt: delegation.grant.expiresAt,
    },
  };
}

function assertExecutionReservationAvailable(
  evaluated: NonNullable<ReturnType<typeof evaluateExecution>>
) {
  const { entry, source, maxExecutions } = evaluated;
  const reservations = entry.executionReservations ?? [];
  const matchingSourceIds = new Set(
    entry.workItemExecutionSources
      ?.filter(
        (record) =>
          record.decompositionBinding === source.decompositionBinding &&
          record.workItemId === source.workItemId
      )
      .map(({ id }) => id)
  );
  if (
    reservations.filter(
      ({ delegationId }) => delegationId === evaluated.execution.delegationId
    ).length >= maxExecutions ||
    reservations.some(({ sourceId }) => matchingSourceIds.has(sourceId))
  )
    throw new Error(
      "Execution budget exhausted or Work Item already reserved."
    );
}

export function checkExecutionEligibility(
  input: unknown
):
  | { status: "eligible" }
  | Exclude<ExecutionAuthorizationVerdict, { status: "authorized" }> {
  try {
    const request = executionRequestSchema.parse(input);
    return withGovernanceLedger((ledger) => {
      const evaluated = evaluateExecution(ledger, request);
      if (!evaluated)
        return {
          status: "approval-required",
          reason: "An explicit Execution Delegation is required.",
        };
      assertExecutionReservationAvailable(evaluated);
      return { status: "eligible" };
    });
  } catch {
    return {
      status: "denied",
      reason:
        "Execution request is invalid, stale, already reserved, or exceeds authority.",
    };
  }
}

// The durable use record survives even if the Worker never starts.
export function authorizeExecutionForRun(
  input: unknown
): ExecutionAuthorizationVerdict {
  try {
    return withGovernanceLedger((ledger, save) => {
      const request = executionRequestSchema.parse(input);
      const evaluated = evaluateExecution(ledger, request);
      if (!evaluated)
        return {
          status: "approval-required",
          reason: "An explicit Execution Delegation is required.",
        };
      const { entry, source } = evaluated;
      assertExecutionReservationAvailable(evaluated);
      const execution = { ...evaluated.execution, id: randomUUID() };
      const now = Date.now();
      if (now + request.timeoutMs > Date.parse(execution.expiresAt))
        throw new Error(
          "Execution delegation has insufficient time remaining."
        );
      const reservedAt = new Date(now).toISOString();
      (entry.executionReservations ??= []).push({
        id: execution.id,
        sourceId: source.id,
        delegationId: execution.delegationId,
        requestDigest: governanceDigest(execution.request),
        executionDigest: governanceDigest(execution),
        reservedAt,
        claimedAt: reservedAt,
      });
      save();
      return { status: "authorized", execution };
    });
  } catch {
    return {
      status: "denied",
      reason:
        "Execution request is invalid, stale, already reserved, exceeds authority, or could not be persisted.",
    };
  }
}
