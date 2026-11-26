import {
  implementationPlanMatchesPaths,
  taskContractSchema,
} from "@/contracts/task.js";
import { isContextScopeContained } from "@/services/repository-inspection/index.js";
import {
  executionScopes,
  executionBoundsSchema,
} from "../../../../approval/features/system-policy/model/execution-system-policy.js";
import { validateTaskExecutionContract } from "../../../validate-task-execution-contract.js";
import {
  assertGovernedGitConfiguration,
  listRepositoryFilesAtCommit,
} from "@/infrastructure/git/index.js";
import {
  agentDecisionSchema,
  validateDecisionEvidence,
} from "@/application/specialist/analysis/index.js";
import { loadAssignmentReadContext } from "./load-assignment-read-context.js";
import type { GovernanceLedger } from "../../../../model/ledger.js";
import { randomUUID } from "node:crypto";
import { governanceDigest } from "@/services/governance-records/index.js";
import {
  AssignmentExecutionError,
  assignmentExecutionRequestSchema,
  digestPreparedAssignmentTask,
  authorizedAssignmentReadExecutionSchema,
  authorizedAssignmentExecutionSchema,
  authorizedAssignmentWriteExecutionSchema,
  isAssignmentReadRecord,
  assignmentWriteResultSchema,
  type AssignmentWriteRecord,
  digestAssignmentWriteResult,
} from "../../../../model/assignment-execution.js";
import { withGovernanceLedger } from "../../../../records/governance-transaction.js";
import { resolvePreparedAssignmentPlan } from "../../../../records/assignment-plans/assignment-plan-records.js";
import type { Handoff } from "../../../../records/assignment-plans/prepare-assignment-context.js";
import {
  assertAssignmentReadDependencies,
  bindAssignmentReadExecution,
  bindAssignmentWriteExecution,
  resolveAssignmentExecution,
  resolveAssignmentBinding,
} from "./resolve-assignment-execution.js";

export function reserveAssignmentExecution(handoff: Handoff, input: unknown) {
  const request = assignmentExecutionRequestSchema.parse(input);
  return withGovernanceLedger((ledger, save) => {
    const context = resolveAssignmentExecution(ledger, handoff, request);
    assertAssignmentReadDependencies(context);
    const { entry, delegation, policy, assignment } = context;
    if (
      assignment.repositoryAccessCeiling === "write" &&
      context.plan.writeDetailingVersion !== 1
    )
      throw new AssignmentExecutionError("legacy-write-plan");
    const prior = entry.assignmentExecutions ?? [];
    const workReservations = entry.executionReservations ?? [];
    if (
      prior.some(({ request: reserved, delegationId }) => {
        if (delegationId !== delegation.id) return false;
        if (reserved.planId === request.planId)
          return (
            reserved.assignmentId === request.assignmentId &&
            reserved.access === request.access
          );
        return entry.assignmentPlans?.some(
          (plan) =>
            plan.id === reserved.planId &&
            plan.assignments.some(
              (item) =>
                item.id === reserved.assignmentId &&
                item.workItemId === assignment.workItemId
            )
        );
      }) ||
      workReservations.some(
        ({ sourceId, delegationId }) =>
          delegationId === delegation.id &&
          entry.workItemExecutionSources?.some(
            (source) =>
              source.id === sourceId &&
              source.workItemId === assignment.workItemId
          )
      )
    )
      throw new AssignmentExecutionError("duplicate");

    const count = [...prior, ...workReservations].filter(
      ({ delegationId }) => delegationId === delegation.id
    ).length;
    if (
      count >=
      Math.min(
        policy.budget.maxExecutions,
        delegation.grant.budget.maxExecutions
      )
    )
      throw new AssignmentExecutionError("budget");

    const now = Date.now();
    if (now + request.timeoutMs > Date.parse(delegation.grant.expiresAt))
      throw new AssignmentExecutionError("authority");

    const id = randomUUID();
    if (request.access === "write") {
      const { execution, binding } = bindAssignmentWriteExecution(
        context,
        request,
        id
      );
      (entry.assignmentExecutions ??= []).push({
        kind: "write",
        id,
        delegationId: delegation.id,
        request,
        execution,
        binding,
        reservedAt: new Date(now).toISOString(),
      });
      save();
      return execution;
    }
    const { execution, binding } = bindAssignmentReadExecution(
      context,
      request,
      id
    );
    (entry.assignmentExecutions ??= []).push({
      id,
      delegationId: delegation.id,
      request,
      execution,
      binding,
      reservedAt: new Date(now).toISOString(),
    });
    save();
    return execution;
  });
}

// A persisted Claim alone cannot start a new context session. Only the object
// returned by a successful transaction in this process can be consumed.
const unusedClaims = new WeakMap<object, string>();

export function claimAssignmentExecution(handoff: Handoff, input: unknown) {
  const execution = authorizedAssignmentExecutionSchema.parse(input);
  const claimed = withGovernanceLedger((ledger, save) => {
    const prepared = resolvePreparedAssignmentPlan(
      ledger,
      handoff,
      execution.planId
    );
    const record = prepared.entry.assignmentExecutions?.find(
      (value) =>
        value.id === execution.id && value.request.planId === execution.planId
    );
    if (!record || record.claimedAt || record.failure)
      throw new AssignmentExecutionError("claim");

    const context = resolveAssignmentBinding(prepared, record.request);
    assertAssignmentReadDependencies(context);
    const current = isAssignmentReadRecord(record)
      ? bindAssignmentReadExecution(context, record.request, record.id)
      : bindAssignmentWriteExecution(context, record.request, record.id);
    if (
      record.binding !== current.binding ||
      record.binding !==
        governanceDigest({ request: record.request, execution })
    )
      throw new AssignmentExecutionError("claim");

    const now = Date.now();
    if (now + execution.timeoutMs > Date.parse(execution.expiresAt))
      throw new AssignmentExecutionError("claim");
    record.claimedAt = new Date(now).toISOString();
    save();
    return current.execution;
  });
  unusedClaims.set(claimed, governanceDigest(claimed));
  return claimed;
}

export function consumeAssignmentReadContext(
  handoff: Handoff,
  claimed: ReturnType<typeof claimAssignmentExecution>
) {
  const issuedDigest = unusedClaims.get(claimed);
  unusedClaims.delete(claimed);
  if (!issuedDigest || issuedDigest !== governanceDigest(claimed))
    throw new AssignmentExecutionError("claim");
  const permit = authorizedAssignmentReadExecutionSchema.parse(claimed);
  const trustedHandoff = structuredClone(handoff);
  const resolveLiveClaim = (ledger: GovernanceLedger) => {
    assertGovernedGitConfiguration(
      permit.snapshot.repositoryRoot,
      Math.min(permit.timeoutMs, 5000),
      "read-only"
    );
    const prepared = resolvePreparedAssignmentPlan(
      ledger,
      trustedHandoff,
      permit.planId
    );
    const record = prepared.entry.assignmentExecutions
      ?.filter(isAssignmentReadRecord)
      .find(({ id }) => id === permit.id);
    if (!record?.claimedAt || record.failure || record.result)
      throw new AssignmentExecutionError("claim");
    const deadlineMs = Math.min(
      Date.parse(record.claimedAt) + permit.timeoutMs,
      Date.parse(permit.expiresAt)
    );
    const remainingTime = () => {
      const time = deadlineMs - Date.now();
      if (time < 1) throw new AssignmentExecutionError("claim");
      return time;
    };
    remainingTime();
    const resolved = resolveAssignmentBinding(prepared, record.request);
    assertAssignmentReadDependencies(resolved);
    const { binding } = bindAssignmentReadExecution(
      resolved,
      record.request,
      record.id
    );
    if (
      record.binding !== binding ||
      binding !==
        governanceDigest({ request: record.request, execution: permit })
    )
      throw new AssignmentExecutionError("claim");
    return { record, resolved, deadlineMs, remainingTime };
  };

  const { context, specialist, workItem, assignment, deadlineMs } =
    withGovernanceLedger((ledger) => {
      const { resolved, deadlineMs, remainingTime } = resolveLiveClaim(ledger);
      const context = loadAssignmentReadContext(
        resolved,
        permit.readScopes,
        remainingTime,
        permit.initialReadPaths
      );
      return {
        context,
        specialist: resolved.specialist,
        workItem: resolved.workItem,
        assignment: resolved.assignment,
        deadlineMs,
      };
    });
  const isReadAssignment = assignment.repositoryAccessCeiling === "read";
  let inspectedContext = context;
  let detailing = false;
  let inspections = 0;
  const inspectionLimits = {
    maxRounds: 4,
    maxFilesPerRequest: 4,
    maxTotalFiles: 32,
  } as const;
  const validateAnalysis = (input: unknown) => {
    try {
      const decision = agentDecisionSchema.parse(input);
      if (decision.specialistId !== permit.specialistId) throw new Error();
      validateDecisionEvidence(context, decision);
      return decision;
    } catch {
      throw new AssignmentExecutionError("validation");
    }
  };

  const eligibleBounds = ({
    resolved,
    remainingTime,
  }: ReturnType<typeof resolveLiveClaim>) => {
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
      readScopes: permit.readScopes,
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
  };
  let finalized = false;
  return {
    context: structuredClone(context),
    specialist,
    workItem,
    assignment,
    authority: permit.authority,
    deadlineMs,
    inspectionLimits,
    checkWriteEligibility() {
      if (finalized) throw new AssignmentExecutionError("claim");
      const bounds = withGovernanceLedger((ledger) =>
        eligibleBounds(resolveLiveClaim(ledger))
      );
      detailing = true;
      return bounds;
    },
    inspect(paths: string[]) {
      if (!detailing || finalized) throw new AssignmentExecutionError("claim");
      if (++inspections >= inspectionLimits.maxRounds)
        throw new AssignmentExecutionError("validation");
      const requested = executionBoundsSchema.shape.readPaths.parse(paths);
      if (
        !requested.length ||
        requested.length > inspectionLimits.maxFilesPerRequest
      )
        throw new AssignmentExecutionError("validation");
      inspectedContext = withGovernanceLedger((ledger) => {
        const live = resolveLiveClaim(ledger);
        eligibleBounds(live);
        return loadAssignmentReadContext(
          live.resolved,
          permit.readScopes,
          live.remainingTime,
          requested,
          inspectedContext
        );
      });
      return structuredClone(inspectedContext);
    },
    recordPreparedTask(input: unknown) {
      if (!detailing || finalized) throw new AssignmentExecutionError("claim");
      finalized = true;
      return withGovernanceLedger((ledger, save) => {
        const live = resolveLiveClaim(ledger);
        const bounds = eligibleBounds(live);
        const task = taskContractSchema.strict().parse(input);
        try {
          validateTaskExecutionContract(task, bounds);
          const { goal } = inspectedContext;
          const conflicts = task.allowedPaths.some((path) =>
            task.forbiddenPaths.some(
              (forbidden) =>
                path.startsWith(forbidden + "/") ||
                forbidden.startsWith(path + "/")
            )
          );
          if (
            conflicts ||
            !task.implementationPlan ||
            task.implementationSteps !== undefined ||
            !implementationPlanMatchesPaths(
              task.implementationPlan,
              task.allowedPaths
            ) ||
            task.targetRepository !== goal.targetRepository ||
            !task.objective.trim() ||
            !task.acceptanceCriteria.length ||
            task.acceptanceCriteria.some((criterion) => !criterion.trim()) ||
            !(goal.constraints ?? []).every((constraint) =>
              task.constraints.includes(constraint)
            )
          )
            throw new Error("Invalid prepared task.");

          // Check existence against the full approved tree internally. Only Read Session
          // blobs can provide content, and unapproved paths are never sent to the Planner.
          const tree = listRepositoryFilesAtCommit(
            permit.snapshot.repositoryRoot,
            permit.snapshot.commitSha,
            {
              timeoutMs: live.remainingTime(),
              ignoreReplaceObjects: true,
            }
          );
          const supplied = new Set(
            inspectedContext.files.map(({ path }) => path)
          );
          const existing = new Map(tree.map(({ path, mode }) => [path, mode]));
          for (const path of task.allowedPaths) {
            const mode = existing.get(path);
            if (mode !== undefined) {
              if (
                (mode !== "100644" && mode !== "100755") ||
                !supplied.has(path)
              )
                throw new Error(
                  "Existing target was not supplied as a regular Snapshot file."
                );
              continue;
            }
            if (
              tree.some(
                ({ path: entry }) =>
                  entry.startsWith(path + "/") || path.startsWith(entry + "/")
              )
            )
              throw new Error(
                "New target collides with an existing Snapshot path."
              );
          }
        } catch (error) {
          if (error instanceof AssignmentExecutionError) throw error;
          throw new AssignmentExecutionError("validation");
        }
        const result = {
          status: "task-prepared" as const,
          task,
          contextDigest: governanceDigest(inspectedContext),
        };
        const { record } = live;
        const digests = digestPreparedAssignmentTask(record, result);
        record.result = { ...result, ...digests };
        live.remainingTime();
        save();
        return {
          invocationId: record.id,
          resultDigest: digests.digest,
          taskContractBinding: digests.taskContractBinding,
        };
      });
    },
    recordResult(input: unknown) {
      if (!isReadAssignment || detailing || finalized)
        throw new AssignmentExecutionError("claim");
      finalized = true;
      const decision = validateAnalysis(input);
      const contextDigest = governanceDigest(inspectedContext);
      return withGovernanceLedger((ledger, save) => {
        const { record, remainingTime } = resolveLiveClaim(ledger);
        const resultDigest = governanceDigest({
          id: record.id,
          binding: record.binding,
          decision,
          contextDigest,
        });
        record.result = { decision, contextDigest, digest: resultDigest };
        remainingTime();
        save();
        return { invocationId: record.id, resultDigest };
      });
    },
  };
}

// This session stays in the process that consumed the Claim.
export type AssignmentReadSession = ReturnType<
  typeof consumeAssignmentReadContext
>;

export function consumeAssignmentWriteExecution(
  handoff: Handoff,
  claim: ReturnType<typeof claimAssignmentExecution>
) {
  const issued = unusedClaims.get(claim);
  unusedClaims.delete(claim);
  if (!issued || issued !== governanceDigest(claim))
    throw new AssignmentExecutionError("claim");
  const permit = authorizedAssignmentWriteExecutionSchema.parse(claim);
  const trustedHandoff = structuredClone(handoff);
  const resolve = (ledger: GovernanceLedger) => {
    const prepared = resolvePreparedAssignmentPlan(
      ledger,
      trustedHandoff,
      permit.planId
    );
    const record = prepared.entry.assignmentExecutions?.find(
      ({ id }) => id === permit.id
    );
    if (
      !record?.claimedAt ||
      isAssignmentReadRecord(record) ||
      record.result ||
      record.failure
    )
      throw new AssignmentExecutionError("claim");
    const context = resolveAssignmentBinding(prepared, record.request);
    assertAssignmentReadDependencies(context);
    const current = bindAssignmentWriteExecution(
      context,
      record.request,
      record.id
    );
    const deadline = Math.min(
      Date.parse(record.claimedAt) + permit.timeoutMs,
      Date.parse(permit.expiresAt)
    );
    if (
      record.binding !== current.binding ||
      record.binding !==
        governanceDigest({ request: record.request, execution: permit }) ||
      deadline <= Date.now()
    )
      throw new AssignmentExecutionError("claim");
    return {
      record,
      task: current.task,
      deadline,
      workItemId: context.workItem.id,
    };
  };
  const { task, deadline, workItemId } = withGovernanceLedger(resolve);
  let finalized = false;
  const execution = {
    task,
    workItemId,
    specialistId: permit.specialistId,
    snapshot: permit.snapshot,
    expiresAt: new Date(deadline).toISOString(),
    timeoutMs: deadline - Date.now(),
    recordResult(
      input: Omit<NonNullable<AssignmentWriteRecord["result"]>, "digest">
    ) {
      if (finalized) throw new AssignmentExecutionError("claim");
      finalized = true;
      return withGovernanceLedger((ledger, save) => {
        const { record } = resolve(ledger);
        const digest = digestAssignmentWriteResult(record, input);
        record.result = assignmentWriteResultSchema.parse({ ...input, digest });
        save();
        return { invocationId: record.id, resultDigest: digest };
      });
    },
  };
  pendingTaskExecutions.set(
    execution,
    structuredClone({
      task: execution.task,
      snapshot: execution.snapshot,
      timeoutMs: execution.timeoutMs,
      expiresAt: execution.expiresAt,
    })
  );
  return execution;
}

type TaskExecutionInput = Pick<
  ReturnType<typeof consumeAssignmentWriteExecution>,
  "task" | "snapshot" | "timeoutMs" | "expiresAt"
>;
const pendingTaskExecutions = new WeakMap<object, TaskExecutionInput>();

// Only the process-local object produced by consuming the Write claim can
// supply a task, and the registered snapshot of its data is authoritative.
export function takeAssignmentTaskExecution(
  execution: TaskExecutionInput
): TaskExecutionInput {
  const approved = pendingTaskExecutions.get(execution);
  pendingTaskExecutions.delete(execution);
  if (!approved || Date.parse(approved.expiresAt) <= Date.now())
    throw new AssignmentExecutionError("claim");
  return approved;
}
