import { getStaffingSystemPolicy } from "@/application/governance/index.js";
import type { PhaseAState } from "../../../state.js";

export function loadSystemPolicy(state: PhaseAState): Partial<PhaseAState> {
  // 1. Check Repository Path
  if (!state.repositoryPath?.trim()) {
    return {
      staffingApprovalResult: undefined,
      specialistDecisionsResult: undefined,
      preparedSpecialistRequests: undefined,
      currentSpecialistIndex: undefined,
      collectedDecisions: undefined,
      specialistComparisonContext: undefined,
      specialistComparison: undefined,
      staffingResult: undefined,
      approvalResult: undefined,
      policyLookup: {
        status: "denied",
        reason: "Repository path is required.",
      },
    };
  }

  // 2. Load Human-approved System Policy
  // Always consult Governance; caller-supplied State cannot establish trust.
  const policyLookup = getStaffingSystemPolicy(state.repositoryPath);

  // 3. Return Policy Lookup Result
  // Replace the whole result so a denial cannot retain stale successful policy data.
  // This completes policy lookup only, not Phase A or the organization workflow.
  // A fresh invocation cannot reuse downstream results from an earlier run.
  return {
    policyLookup,
    staffingApprovalResult: undefined,
    specialistDecisionsResult: undefined,
    preparedSpecialistRequests: undefined,
    currentSpecialistIndex: undefined,
    collectedDecisions: undefined,
    specialistComparisonContext: undefined,
    specialistComparison: undefined,
    staffingResult: undefined,
    approvalResult: undefined,
  };
}
