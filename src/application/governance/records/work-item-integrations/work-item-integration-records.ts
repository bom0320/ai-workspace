import { governanceDigest } from "@/services/governance-records/index.js";
import { fingerprintExecutionArtifacts } from "@/services/artifacts/index.js";
import { checkScope } from "@/services/scope/index.js";
import { resolveAssignmentExecutionResults } from "../assignment-executions/assignment-execution-results.js";
import { resolvePreparedAssignmentPlan } from "../assignment-plans/assignment-plan-records.js";
import type { Handoff } from "../assignment-plans/prepare-assignment-context.js";
import { withGovernanceLedger } from "../governance-transaction.js";
import type { GovernanceLedger } from "../../model/ledger.js";
import {
  assignmentDelegationBinding,
  isAssignmentReadRecord,
} from "../../model/assignment-execution.js";
import { resolveApprovedDecision } from "../../approval/features/direction-review/flow/approved-decision.js";
import {
  workItemResultSchema,
  type WorkItemResult,
} from "../../model/work-item-integration.js";

function resolveSources(
  ledger: GovernanceLedger,
  handoff: Handoff,
  planId: string
) {
  const context = resolvePreparedAssignmentPlan(ledger, handoff, planId);
  const sources = resolveAssignmentExecutionResults(
    ledger,
    handoff,
    planId,
    true
  );
  return { ...context, sources };
}

function resolveWorkItemSources(
  context: ReturnType<typeof resolveSources>,
  result: WorkItemResult
) {
  const required = context.plan.assignments.filter(
    ({ workItemId }) => workItemId === result.workItemId
  );
  if (
    !required.length ||
    !context.plan.selectedWorkItemIds.includes(result.workItemId) ||
    result.planId !== context.plan.id ||
    governanceDigest(result.snapshot) !==
      governanceDigest(context.plan.snapshot) ||
    required.length !== result.assignmentResults.length
  )
    throw new Error("Invalid integrated Work Item provenance.");
  const scopes = required.flatMap((assignment, index) => {
    const ref = result.assignmentResults[index]!;
    const sources = context.sources.filter(
      ({ assignmentId }) => assignmentId === assignment.id
    );
    const source = sources[0];
    if (
      sources.length !== 1 ||
      !source ||
      source.assignmentId !== ref.assignmentId ||
      source.workItemId !== result.workItemId ||
      source.invocationId !== ref.invocationId ||
      source.status !== ref.status ||
      source.resultDigest !== ref.resultDigest ||
      (source.status === "read-completed" &&
        assignment.repositoryAccessCeiling !== "read")
    )
      throw new Error("Work Item does not match its Assignment results.");
    if (source.status === "read-completed") return [];
    if (
      ref.status !== "write-completed" ||
      assignment.repositoryAccessCeiling !== "write" ||
      !source.integrationScope ||
      source.taskContractBinding !== ref.taskContractBinding ||
      governanceDigest(source.artifacts) !== governanceDigest(ref.artifacts)
    )
      throw new Error("Work Item does not match its approved Write results.");
    return [source.integrationScope];
  });
  if (result.status === "read-integrated") {
    if (scopes.length)
      throw new Error("Work Item is missing its write artifact.");
  } else if (
    !scopes.length ||
    new Set(result.changedPaths).size !== result.changedPaths.length ||
    !result.changedPaths.every((path) =>
      scopes.some(
        ({ allowedPaths, forbiddenPaths }) =>
          checkScope([path], allowedPaths, forbiddenPaths).passed
      )
    )
  ) {
    throw new Error(
      "Work Item changed paths exceed its own Assignment scopes."
    );
  }
  return scopes;
}

// Internal writer called only after Assignment Integration has verified and removed
// its worktree. Revalidate provenance under the same lock as the Ledger write.
export function recordWorkItemIntegration(
  handoff: Handoff,
  input: WorkItemResult
) {
  return withGovernanceLedger((ledger, save) => {
    const result = workItemResultSchema.parse(input);
    const context = resolveSources(ledger, handoff, result.planId);
    resolveWorkItemSources(context, result);
    const delegationId = context.delegation.id;
    const existing = context.entry.workItemIntegrations?.find(
      (record) =>
        record.delegationId === delegationId &&
        record.result.planId === result.planId &&
        record.result.workItemId === result.workItemId
    );
    if (existing) {
      resolveWorkItemSources(context, existing.result);
      assertArtifact(existing.result);
      return structuredClone(existing.result);
    }
    assertArtifact(result);
    const subject = {
      delegationId,
      approvalBinding: governanceDigest(context.decision),
      result,
    };
    (context.entry.workItemIntegrations ??= []).push({
      ...subject,
      digest: governanceDigest(subject),
    });
    save();
    return result;
  });
}

function assertArtifact(result: WorkItemResult) {
  if (
    result.status === "write-integrated" &&
    governanceDigest(
      fingerprintExecutionArtifacts(result.artifacts.directory)
    ) !== governanceDigest(result.artifacts)
  )
    throw new Error("Stored Work Item artifact fingerprint differs.");
}

export function getRecordedWorkItemIntegrations(
  handoff: Handoff,
  planId: string
) {
  return withGovernanceLedger((ledger) => {
    const context = resolveSources(ledger, handoff, planId);
    const integrations = (context.entry.workItemIntegrations ?? [])
      .filter(
        ({ delegationId, result }) =>
          delegationId === context.delegation.id && result.planId === planId
      )
      .map(({ result, digest }) => ({
        result,
        digest,
        scopes: resolveWorkItemSources(context, result),
      }));
    return {
      plan: context.plan,
      integrations,
      failedWorkItemIds: [
        ...new Set(
          context.sources
            .filter(({ status }) => status === "failed")
            .map(({ workItemId }) => workItemId)
        ),
      ],
    };
  });
}

// Historical inspection resolves stored evidence without granting live Repository
// access or requiring the execution delegation to stay active during evaluation.
export function getIntegratedAssignmentSources(
  handoff: Handoff,
  planId: string,
  workItemId: string
) {
  return withGovernanceLedger((ledger) => {
    const { entry, decision } = resolveApprovedDecision(
      ledger,
      handoff.decision.id
    );
    const delegation = entry.executionDelegations?.find(
      ({ id }) => id === handoff.executionDelegation.id
    );
    const approvalBinding = governanceDigest(decision);
    if (
      !delegation ||
      delegation.approvedDecisionId !== decision.id ||
      approvalBinding !== governanceDigest(handoff.decision) ||
      assignmentDelegationBinding(delegation) !==
        assignmentDelegationBinding(handoff.executionDelegation)
    )
      throw new Error(
        "Historical Work Item approval does not match the Handoff."
      );
    const stored = entry.workItemIntegrations?.find(
      (record) =>
        record.delegationId === delegation.id &&
        record.approvalBinding === approvalBinding &&
        record.result.planId === planId &&
        record.result.workItemId === workItemId
    );
    if (!stored) return undefined;
    assertArtifact(stored.result);
    const records = entry.assignmentExecutions ?? [];
    const assignments = stored.result.assignmentResults.map((ref) => {
      // Ledger parsing already checks that each invocation and prepared task
      // belongs to this approval, Plan and Assignment.
      const execution = records.find(({ id }) => id === ref.invocationId)!;
      if (isAssignmentReadRecord(execution)) return { execution };
      if (
        ref.status !== "write-completed" ||
        governanceDigest(
          fingerprintExecutionArtifacts(ref.artifacts.directory)
        ) !== governanceDigest(ref.artifacts)
      )
        throw new Error("Stored Assignment artifact fingerprint differs.");
      const prepared = records.find(
        ({ id }) => id === execution.execution.preparedInvocationId
      );
      return { execution, prepared };
    });
    return { ...stored, assignments };
  });
}
