import { governanceDigest } from "@/services/governance-records/index.js";
import type { RepositoryGovernance } from "../../../../model/ledger.js";
import {
  executionScopes,
  isExecutionScopeContained,
  type ExecutionSystemPolicy,
} from "../../system-policy/model/execution-system-policy.js";
import type { RepositorySnapshot } from "@/contracts/repository/snapshot.js";
import type { ApprovedDecision } from "../../direction-review/model/result.js";
import type { ExecutionDelegationRequest } from "../model/execution-delegation.js";

export function executionDelegationId(approvedDecisionId: string): string {
  return `execution-delegation-${governanceDigest(approvedDecisionId)}`;
}

export function isExecutionGrantWithinPolicy(
  grant: ExecutionDelegationRequest,
  policy: ExecutionSystemPolicy,
  issuedAt: number
): boolean {
  const duration = Date.parse(grant.expiresAt) - issuedAt;
  return (
    (grant.workerMode === undefined ||
      grant.workerMode === policy.workerMode) &&
    duration > 0 &&
    duration <= policy.maxDelegationDurationMs &&
    isExecutionScopeContained(
      executionScopes(grant),
      executionScopes(policy)
    ) &&
    grant.shellCommands.every((command) =>
      policy.shellCommands.includes(command)
    ) &&
    grant.budget.maxExecutions <= policy.budget.maxExecutions &&
    grant.budget.maxTimeoutMs <= policy.budget.maxTimeoutMs
  );
}

export function currentPolicyForExecutionGrant(
  entry: RepositoryGovernance,
  grant: ExecutionDelegationRequest,
  now: number
) {
  const current = entry.executionPolicies?.at(-1);
  if (
    current?.policy &&
    current.version === grant.policyVersion &&
    isExecutionGrantWithinPolicy(grant, current.policy, now)
  )
    return current;
}

export function postDirectionDelegationBinding(
  decision: ApprovedDecision,
  directionApprovalDigest: string,
  snapshot: RepositorySnapshot,
  policyBinding: string,
  grant: ExecutionDelegationRequest
): string {
  return governanceDigest({
    action: "approve-execution-delegation",
    decision,
    directionApprovalDigest,
    snapshot,
    policyBinding,
    grant,
  });
}

export function hasValidExecutionDelegationRecords(
  repositoryKey: string,
  entry: RepositoryGovernance,
  delegationIds: Set<string>,
  approvalIds: Set<string>,
  staffingConfirmationIds: ReadonlySet<string>,
  directionConfirmationCounts: ReadonlyMap<string, number>
): boolean {
  const policies = entry.executionPolicies ?? [];
  const grants = entry.executionDelegations ?? [];
  for (const record of grants) {
    const decisions =
      entry.approvedDecisions?.filter(
        ({ id }) => id === record.approvedDecisionId
      ) ?? [];
    const decision = decisions[0];
    const reviews =
      entry.directionReviews?.filter(({ id }) => id === decision?.reviewId) ??
      [];
    const review = reviews[0];
    const resolution = review?.resolution;
    const scopes = entry.issuances.filter(
      ({ scope }) =>
        scope.id === review?.scopeId && scope.version === review?.scopeVersion
    );
    const policy = policies[record.grant.policyVersion - 1];
    const next = policies[record.grant.policyVersion];
    const issuedAt = Date.parse(record.issuedAt);
    if (
      decisions.length !== 1 ||
      reviews.length !== 1 ||
      scopes.length !== 1 ||
      scopes[0].scope.snapshot.repositoryRoot !== record.repositoryRoot ||
      resolution?.action.action !== "approve" ||
      delegationIds.has(record.id) ||
      approvalIds.has(record.approval.id) ||
      staffingConfirmationIds.has(record.approval.id) ||
      record.id !== executionDelegationId(record.approvedDecisionId) ||
      record.status !== "active" ||
      governanceDigest(record.repositoryRoot) !== repositoryKey ||
      decision.reviewBinding !== review.binding ||
      resolution.action.binding !== review.binding ||
      resolution.action.reviewId !== review.id ||
      decision.approvalRecordId !== resolution.id ||
      record.approvalRecordId !== resolution.id ||
      record.approval.uid !== process.getuid?.() ||
      Date.parse(record.approval.confirmedAt) > issuedAt ||
      !policy?.policy ||
      Date.parse(policy.configuredAt) >
        Date.parse(record.approval.confirmedAt) ||
      (next && Date.parse(next.configuredAt) < issuedAt) ||
      !isExecutionGrantWithinPolicy(record.grant, policy.policy, issuedAt)
    )
      return false;
    if (record.approvalSource === "post-direction") {
      if (
        resolution.action.executionDelegation ||
        directionConfirmationCounts.has(record.approval.id) ||
        Date.parse(record.approval.confirmedAt) <
          Date.parse(resolution.resolvedAt) ||
        record.confirmationBinding !==
          postDirectionDelegationBinding(
            decision,
            governanceDigest(resolution),
            scopes[0].scope.snapshot,
            policy.binding,
            record.grant
          )
      )
        return false;
    } else if (
      !resolution.action.executionDelegation ||
      directionConfirmationCounts.get(record.approval.id) !== 1 ||
      record.issuedAt !== resolution.resolvedAt ||
      record.confirmationBinding !== resolution.confirmationBinding ||
      record.confirmationBinding !==
        governanceDigest({
          reviewBinding: review.binding,
          action: resolution.action,
        }) ||
      governanceDigest(record.approval) !==
        governanceDigest(resolution.confirmation) ||
      governanceDigest(record.grant) !==
        governanceDigest(resolution.action.executionDelegation)
    )
      return false;
    delegationIds.add(record.id);
    approvalIds.add(record.approval.id);
  }

  // A combined resolution must always have exactly one linked delegation.
  return (entry.directionReviews ?? []).every(
    ({ resolution }) =>
      resolution?.action.action !== "approve" ||
      !resolution.action.executionDelegation ||
      grants.filter(
        ({ approvalRecordId }) => approvalRecordId === resolution.id
      ).length === 1
  );
}
