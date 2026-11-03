import { isUnambiguousRepositoryPath } from "@/services/repository-inspection/index.js";
import {
  staffingSystemPolicySchema,
  type StaffingSystemPolicy,
} from "../../model/policy.js";
import { resolveGovernanceRepository } from "../../../../shared/validation/approval-input.js";

export function validateSystemConfiguration(
  input: unknown
): StaffingSystemPolicy {
  const configuration = staffingSystemPolicySchema.parse(input);
  configuration.repositoryRoot = resolveGovernanceRepository(
    configuration.repositoryRoot
  );
  const specialists = configuration.availableSpecialists;
  if (new Set(specialists.map(({ id }) => id)).size !== specialists.length)
    throw new Error("System Policy requires unique Specialist registrations.");
  if (
    specialists.some(
      ({ authority }) =>
        authority.repositoryAccess !== "read" || authority.shellExecution
    )
  )
    throw new Error("System Policy is restricted to read-only analysis.");
  if (
    configuration.allowedContextPaths.some(
      (path) => !isUnambiguousRepositoryPath(path)
    )
  )
    throw new Error("System Policy requires unambiguous Context paths.");
  return configuration;
}
