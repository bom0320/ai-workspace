import { lstatSync, realpathSync } from "node:fs";
import { join } from "node:path";
import { listRepositoryFilesAtCommit } from "@/infrastructure/git/index.js";
import { governanceDigest } from "@/services/governance-records/index.js";
import { assertRepositoryMatchesSnapshot } from "@/services/repository-snapshot/index.js";
import { resolveApprovedDecision } from "../../../../../approval/features/direction-review/flow/approved-decision.js";
import {
  executionDelegationId,
  isExecutionGrantWithinPolicy,
} from "../../../../../approval/features/execution-delegation/validation/validate-execution-delegation-records.js";
import {
  executionScopes,
  isExecutionScopeContained,
} from "../../../../../approval/features/system-policy/model/execution-system-policy.js";
import type { GovernanceLedger } from "../../../../../model/ledger.js";
import { resolveGovernanceRepository } from "../../../../../records/governance-transaction.js";
import type { WorkItemExecutionRequest } from "../../model/execution.js";
import { validateTaskExecutionContract } from "../validation/validate-task-execution-contract.js";

export function resolveExecutionContext(
  ledger: GovernanceLedger,
  request: WorkItemExecutionRequest
) {
  const { entry, decision, context, snapshot } = resolveApprovedDecision(
    ledger,
    request.approvedDecisionId
  );
  const repositoryPath = resolveGovernanceRepository(request.repositoryPath);
  if (repositoryPath !== snapshot.repositoryRoot)
    throw new Error("Execution Repository mismatch.");

  const delegation = entry.executionDelegations?.find(
    ({ id }) => id === executionDelegationId(decision.id)
  );
  if (!delegation) return undefined;
  const workerMode = "workerMode" in request ? request.workerMode : undefined;
  const policy = entry.executionPolicies?.at(-1);
  if (
    !policy?.policy ||
    policy.version !== delegation.grant.policyVersion ||
    delegation.repositoryRoot !== repositoryPath ||
    delegation.status !== "active" ||
    (workerMode !== undefined && workerMode !== delegation.grant.workerMode)
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
    !workItem ||
    governanceDigest(workItem) !== governanceDigest(request.workItem) ||
    workItem.dependsOn.length
  )
    throw new Error("Unverified Work Item, dependencies or TaskContract.");

  const { readPaths, timeoutMs } = request;
  const readOnly = !("task" in request);
  if (
    readOnly
      ? !("readOnly" in source) ||
        !readPaths.length ||
        delegation.approvalSource === "post-direction"
      : !("taskDigest" in source) ||
        source.taskDigest !== governanceDigest(request.task) ||
        request.task.targetRepository !== context.goal.targetRepository ||
        !(context.goal.constraints ?? []).every((constraint) =>
          request.task.constraints.includes(constraint)
        )
  )
    throw new Error(
      "Execution contract does not match the approved Work Item."
    );

  const { writePaths, shellCommands } =
    "task" in request
      ? validateTaskExecutionContract(request.task, delegation.grant)
      : { writePaths: [], shellCommands: [] };

  const requestedGrant = {
    readPaths,
    ...(workerMode && { workerMode }),
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
  const files = new Map(
    listRepositoryFilesAtCommit(repositoryPath, snapshot.commitSha)
      .filter(({ mode }) => mode === "100644" || mode === "100755")
      .map((file) => [file.path, file])
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
  if (
    readOnly &&
    readPaths.reduce(
      (bytes, path) => bytes + (files.get(path)?.size ?? Infinity),
      0
    ) >
      64 * 1024
  )
    throw new Error("Read-only Context exceeds the supported size.");
  if (Date.now() + timeoutMs > Date.parse(delegation.grant.expiresAt))
    throw new Error(
      "Execution delegation expired or remaining time is insufficient."
    );

  const execution = {
    snapshot,
    delegationId: delegation.id,
    delegationBinding: governanceDigest(delegation),
    policyVersion: policy.version,
    policyBinding: policy.binding,
    expiresAt: delegation.grant.expiresAt,
  };
  return {
    entry,
    source,
    maxExecutions: Math.min(
      policy.policy.budget.maxExecutions,
      delegation.grant.budget.maxExecutions
    ),
    execution:
      "task" in request
        ? { ...execution, request: { ...request, repositoryPath } }
        : {
            ...execution,
            request: { ...request, repositoryPath },
            goal: context.goal,
          },
  };
}
