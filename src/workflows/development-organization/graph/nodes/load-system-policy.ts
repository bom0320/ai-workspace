import { getStaffingSystemPolicy } from "@/application/governance/index.js";
import type { DevelopmentOrganizationState } from "../state.js";

export function loadSystemPolicy(
  state: DevelopmentOrganizationState
): Partial<DevelopmentOrganizationState> {
  // 1. Check Repository Path
  if (!state.repositoryPath?.trim()) {
    return {
      status: "policy-unavailable",
      failure: "Repository path is required.",
      systemPolicy: undefined,
      policyVersion: undefined,
    };
  }

  // 2. Load Human-approved System Policy
  // Always consult Governance; caller-supplied State cannot establish trust.
  const policy = getStaffingSystemPolicy(state.repositoryPath);
  if (policy.status !== "ready") {
    return {
      status: "policy-unavailable",
      failure: policy.reason,
      systemPolicy: undefined,
      policyVersion: undefined,
    };
  }

  // 3. Return Policy Lookup Result
  // This status completes policy lookup only, not Phase A or the organization workflow.
  return {
    status: "policy-ready",
    systemPolicy: policy.configuration,
    policyVersion: policy.version,
    failure: undefined,
  };
}
