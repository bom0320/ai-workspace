import { governanceDigest } from "@/services/governance-records/index.js";
import type { RepositoryGovernance } from "../../../../../model/ledger.js";
import type { ExecutionSystemPolicy } from "../../model/execution-system-policy.js";

export function executionPolicyBinding(
  repositoryRoot: string,
  version: number,
  policy: ExecutionSystemPolicy | null
): string {
  return governanceDigest({
    action: "configure-execution-policy",
    repositoryRoot,
    version,
    policy,
  });
}

export function hasValidExecutionPolicyRecords(
  repositoryKey: string,
  entry: RepositoryGovernance,
  approvalIds: Set<string>,
  staffingConfirmationIds: ReadonlySet<string>,
  directionConfirmationCounts: ReadonlyMap<string, number>
): boolean {
  const policies = entry.executionPolicies ?? [];
  for (const [index, record] of policies.entries()) {
    const previous = policies[index - 1];
    if (
      record.version !== index + 1 ||
      governanceDigest(record.repositoryRoot) !== repositoryKey ||
      record.binding !==
        executionPolicyBinding(
          record.repositoryRoot,
          record.version,
          record.policy
        ) ||
      record.approval.uid !== process.getuid?.() ||
      approvalIds.has(record.approval.id) ||
      staffingConfirmationIds.has(record.approval.id) ||
      directionConfirmationCounts.has(record.approval.id) ||
      Date.parse(record.approval.confirmedAt) >
        Date.parse(record.configuredAt) ||
      (previous &&
        Date.parse(previous.configuredAt) > Date.parse(record.configuredAt))
    )
      return false;
    approvalIds.add(record.approval.id);
  }

  return true;
}
