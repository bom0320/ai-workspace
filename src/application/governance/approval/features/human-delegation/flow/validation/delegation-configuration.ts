import {
  validateContextAccessPolicy,
  isContextScopeContained,
} from "@/services/repository-inspection/index.js";
import {
  humanDelegationPolicyInputSchema,
  type HumanDelegationPolicyInput,
  type RecordedHumanDelegationPolicy,
} from "../../model/policy.js";
import type { StaffingSystemPolicy } from "../../../system-policy/model/policy.js";

// A delegation may narrow the configured system boundaries, never expand them.
export function validateDelegationConfiguration(
  policy: HumanDelegationPolicyInput,
  system: StaffingSystemPolicy,
  now: number = Date.now()
): void {
  if (Date.parse(policy.expiresAt) <= now)
    throw new Error("Delegation has expired.");
  if (
    new Set(policy.allowedSpecialistIds).size !==
      policy.allowedSpecialistIds.length ||
    policy.allowedSpecialistIds.some(
      (id) =>
        !system.availableSpecialists.some((specialist) => specialist.id === id)
    )
  )
    throw new Error("Delegation must reference unique registered Specialists.");
  const maximum = validateContextAccessPolicy(system.contextAccessPolicy);
  if (
    policy.delegatedContextScopes.some(
      (scope) => !isContextScopeContained(scope, maximum)
    )
  )
    throw new Error("Delegation Context must stay inside System Policy.");
  if (policy.maxAgentInvocations > system.maxAgentInvocations)
    throw new Error("Delegation budget exceeds System Policy.");
}

// Normalize only an evaluation projection; never rewrite the signed record.
export function readRecordedDelegationInput(
  record: RecordedHumanDelegationPolicy
): HumanDelegationPolicyInput {
  const scopes =
    "delegatedContextScopes" in record
      ? record.delegatedContextScopes
      : readHistoricalContextScopes(record);
  return humanDelegationPolicyInputSchema.parse({
    allowedSpecialistIds: record.allowedSpecialistIds,
    delegatedContextScopes: scopes,
    maxAgentInvocations: record.maxAgentInvocations,
    expiresAt: record.expiresAt,
  });
}

// Historical projection only: exact entries never acquire directory authority.
// Preserve the signed object unchanged, including empty legacy lists.
function readHistoricalContextScopes(
  record: Extract<RecordedHumanDelegationPolicy, { phase: "phase-a" }>
) {
  const paths = record.allowedContextPaths ?? [];
  if (record.contextAccessPolicy !== undefined && paths.length)
    throw new Error("Ambiguous historical Delegation Context scopes.");
  return validateContextAccessPolicy(
    record.contextAccessPolicy ?? {
      allowedScopes: paths.map((path) => ({ kind: "file", path })),
    }
  ).allowedScopes;
}
