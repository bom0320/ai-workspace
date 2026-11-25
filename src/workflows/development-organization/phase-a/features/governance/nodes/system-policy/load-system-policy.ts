import type {
  PhaseANodeInput,
  PhaseANodeOutput,
} from "../../../../data-flow.js";
import { getStaffingSystemPolicy } from "@/application/governance/index.js";

export function loadSystemPolicy(
  state: PhaseANodeInput<"load-system-policy">,
  includeDelegationConstraints = false
): PhaseANodeOutput<"load-system-policy"> {
  // 1. Check Repository Path
  if (!state.repositoryPath?.trim()) {
    return {
      specialistDecisionsResult: undefined,
      preparedSpecialistRequests: undefined,
      currentSpecialistIndex: undefined,
      collectedDecisions: undefined,
      analysisRepresentatives: undefined,
      analysisBatchInvocationIds: undefined,
      analysisAssessment: undefined,
      analysisRefinement: undefined,
      specialistComparisonContext: undefined,
      decisionComparisonResult: undefined,
      synthesisAssignments: undefined,
      synthesisResult: undefined,
      directionReview: undefined,
      phaseACompletion: undefined,
      directionAction: undefined,
      directionGovernanceResult: undefined,
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
  const policyLookup = includeDelegationConstraints
    ? getStaffingSystemPolicy(state.repositoryPath, true)
    : getStaffingSystemPolicy(state.repositoryPath);

  // 3. Return Policy Lookup Result
  // Replace the whole result so a denial cannot retain stale successful policy data.
  // This completes policy lookup only, not Phase A or the organization workflow.
  // A fresh invocation cannot reuse downstream results from an earlier run.
  return {
    policyLookup,
    specialistDecisionsResult: undefined,
    preparedSpecialistRequests: undefined,
    currentSpecialistIndex: undefined,
    collectedDecisions: undefined,
    analysisRepresentatives: undefined,
    analysisBatchInvocationIds: undefined,
    analysisAssessment: undefined,
    analysisRefinement: undefined,
    specialistComparisonContext: undefined,
    decisionComparisonResult: undefined,
    synthesisAssignments: undefined,
    synthesisResult: undefined,
    directionReview: undefined,
    phaseACompletion: undefined,
    directionAction: undefined,
    directionGovernanceResult: undefined,
    staffingResult: undefined,
    approvalResult: undefined,
  };
}
