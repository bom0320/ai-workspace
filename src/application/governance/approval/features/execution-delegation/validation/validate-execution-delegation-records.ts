import { governanceDigest } from "@/services/governance-records/index.js";
import type { RepositoryGovernance } from "../../../../model/ledger.js";
import type { ExecutionSystemPolicy } from "../../system-policy/model/execution-system-policy.js";
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
    duration > 0 &&
    duration <= policy.maxDelegationDurationMs &&
    grant.readPaths.every((path) => policy.readPaths.includes(path)) &&
    grant.writePaths.every((path) => policy.writePaths.includes(path)) &&
    grant.shellCommands.every((command) =>
      policy.shellCommands.includes(command)
    ) &&
    grant.budget.maxExecutions <= policy.budget.maxExecutions &&
    grant.budget.maxTimeoutMs <= policy.budget.maxTimeoutMs
  );
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
      !resolution.action.executionDelegation ||
      delegationIds.has(record.id) ||
      approvalIds.has(record.approval.id) ||
      staffingConfirmationIds.has(record.approval.id) ||
      directionConfirmationCounts.get(record.approval.id) !== 1 ||
      record.id !== executionDelegationId(record.approvedDecisionId) ||
      record.status !== "active" ||
      governanceDigest(record.repositoryRoot) !== repositoryKey ||
      decision.reviewBinding !== review.binding ||
      resolution.action.binding !== review.binding ||
      resolution.action.reviewId !== review.id ||
      decision.approvalRecordId !== resolution.id ||
      record.approvalRecordId !== resolution.id ||
      record.issuedAt !== resolution.resolvedAt ||
      record.confirmationBinding !== resolution.confirmationBinding ||
      record.confirmationBinding !==
        governanceDigest({
          reviewBinding: review.binding,
          action: resolution.action,
        }) ||
      governanceDigest(record.approval) !==
        governanceDigest(resolution.confirmation) ||
      record.approval.uid !== process.getuid?.() ||
      Date.parse(record.approval.confirmedAt) > issuedAt ||
      governanceDigest(record.grant) !==
        governanceDigest(resolution.action.executionDelegation) ||
      !policy?.policy ||
      Date.parse(policy.configuredAt) >
        Date.parse(record.approval.confirmedAt) ||
      (next && Date.parse(next.configuredAt) < issuedAt) ||
      !isExecutionGrantWithinPolicy(record.grant, policy.policy, issuedAt)
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
