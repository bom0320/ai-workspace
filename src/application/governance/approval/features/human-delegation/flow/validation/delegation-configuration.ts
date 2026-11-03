import { isUnambiguousRepositoryPath } from "@/services/repository-inspection/index.js";
import type { HumanDelegationPolicyInput } from "../../model/policy.js";
import type { StaffingSystemPolicy } from "../../../system-policy/model/policy.js";

// A delegation may narrow the configured system boundaries, never expand them.
export function validateDelegationConfiguration(
  policy: HumanDelegationPolicyInput,
  system: StaffingSystemPolicy
): void {
  if (Date.parse(policy.expiresAt) <= Date.now())
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
  if (
    policy.allowedContextPaths.some(
      (path) =>
        !isUnambiguousRepositoryPath(path) ||
        !system.allowedContextPaths.includes(path)
    )
  )
    throw new Error("Delegation Context must stay inside System Policy.");
  if (policy.maxAgentInvocations > system.policy.maxAgentInvocations)
    throw new Error("Delegation budget exceeds System Policy.");
}
