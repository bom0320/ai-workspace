import { validateContextAccessPolicy } from "@/services/repository-inspection/index.js";
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
  validateContextAccessPolicy(configuration.contextAccessPolicy);
  return configuration;
}
