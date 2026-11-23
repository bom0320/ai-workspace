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
  authorizedExecutionSchema,
  executionRequestSchema,
  type AuthorizedExecution,
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

export function authorizeExecution(
  input: unknown
): ExecutionAuthorizationVerdict {
  try {
    const request = executionRequestSchema.parse(input);
    return withGovernanceLedger(
      (ledger, save): ExecutionAuthorizationVerdict => {
        const evaluated = evaluateExecution(ledger, request);
        if (!evaluated)
          return {
            status: "approval-required",
            reason: "An explicit Execution Delegation is required.",
          };
        const { entry, source, maxExecutions } = evaluated;
        const reservations = (entry.executionReservations ??= []);
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
            ({ delegationId }) =>
              delegationId === evaluated.execution.delegationId
          ).length >= maxExecutions ||
          reservations.some(({ sourceId }) => matchingSourceIds.has(sourceId))
        )
          throw new Error(
            "Execution budget exhausted or Work Item already reserved."
          );
        const execution = { ...evaluated.execution, id: randomUUID() };
        reservations.push({
          id: execution.id,
          sourceId: source.id,
          delegationId: execution.delegationId,
          requestDigest: governanceDigest(execution.request),
          executionDigest: governanceDigest(execution),
          reservedAt: new Date().toISOString(),
        });
        save();
        return { status: "allowed", execution };
      }
    );
  } catch {
    return {
      status: "denied",
      reason:
        "Execution request is invalid, stale, already reserved, exceeds authority, or could not be persisted.",
    };
  }
}

// Step 10.2-3 must call this immediately before starting the Worker and use
// only the returned request/snapshot. An unclaimed decision cannot start work.
export function claimAuthorizedExecution(
  input: unknown
):
  | { status: "claimed"; execution: AuthorizedExecution }
  | { status: "denied"; reason: string } {
  try {
    // Legacy permits contain extra request fields. Reject them as issued instead
    // of translating either digest or releasing their durable reservation.
    const execution = authorizedExecutionSchema.parse(input);
    return withGovernanceLedger((ledger, save) => {
      const evaluated = evaluateExecution(ledger, execution.request);
      const reservation = evaluated?.entry.executionReservations?.find(
        ({ id }) => id === execution.id
      );
      if (
        !evaluated ||
        !reservation ||
        reservation.claimedAt ||
        reservation.sourceId !== execution.request.executionSourceId ||
        reservation.delegationId !== execution.delegationId ||
        reservation.requestDigest !== governanceDigest(execution.request) ||
        reservation.executionDigest !== governanceDigest(execution) ||
        governanceDigest({ ...evaluated.execution, id: execution.id }) !==
          reservation.executionDigest
      )
        throw new Error(
          "Execution reservation is missing, stale, altered or already claimed."
        );
      reservation.claimedAt = new Date().toISOString();
      save();
      return { status: "claimed", execution };
    });
  } catch {
    return {
      status: "denied",
      reason:
        "Execution claim is invalid, stale, consumed, or could not be persisted.",
    };
  }
}
