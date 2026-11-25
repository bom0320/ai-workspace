import type { PhaseAState } from "./state.js";

export const phaseADataFlow = {
  "load-system-policy": {
    input: ["repositoryPath"],
    output: [
      "policyLookup",
      "specialistDecisionsResult",
      "preparedSpecialistRequests",
      "currentSpecialistIndex",
      "collectedDecisions",
      "analysisRepresentatives",
      "analysisBatchInvocationIds",
      "analysisAssessment",
      "analysisRefinement",
      "specialistComparisonContext",
      "decisionComparisonResult",
      "synthesisAssignments",
      "synthesisResult",
      "directionReview",
      "phaseACompletion",
      "directionAction",
      "directionGovernanceResult",
      "staffingResult",
      "approvalResult",
    ],
  },
  "run-staffing": {
    input: ["goal", "policyLookup"],
    output: ["staffingResult"],
  },
  "evaluate-staffing-approval": {
    input: ["staffingResult"],
    output: ["approvalResult"],
  },
  "confirm-staffing-approval": {
    input: ["staffingResult", "approvalResult"],
    output: ["approvalResult"],
  },
  "preflight-specialist-decisions": {
    input: ["approvalResult"],
    output: [
      "specialistDecisionsResult",
      "preparedSpecialistRequests",
      "synthesisAssignments",
      "currentSpecialistIndex",
      "collectedDecisions",
      "specialistComparisonContext",
    ],
  },
  "execute-next-specialist": {
    input: [
      "preparedSpecialistRequests",
      "currentSpecialistIndex",
      "collectedDecisions",
      "specialistDecisionsResult",
      "analysisRefinement",
      "analysisRepresentatives",
      "analysisBatchInvocationIds",
      "synthesisAssignments",
    ],
    output: [
      "collectedDecisions",
      "currentSpecialistIndex",
      "specialistDecisionsResult",
      "analysisRepresentatives",
      "analysisBatchInvocationIds",
      "synthesisAssignments",
    ],
  },
  "compare-specialist-decisions": {
    input: ["specialistDecisionsResult", "specialistComparisonContext"],
    output: ["decisionComparisonResult"],
  },
  "assess-analysis": {
    input: [
      "specialistDecisionsResult",
      "decisionComparisonResult",
      "specialistComparisonContext",
      "synthesisAssignments",
      "approvalResult",
      "analysisRepresentatives",
    ],
    output: ["analysisAssessment", "analysisRefinement"],
  },
  "prepare-refinement": {
    input: [
      "specialistDecisionsResult",
      "decisionComparisonResult",
      "specialistComparisonContext",
      "synthesisAssignments",
      "analysisAssessment",
      "analysisRepresentatives",
      "approvalResult",
    ],
    output: [
      "analysisRefinement",
      "preparedSpecialistRequests",
      "synthesisAssignments",
      "currentSpecialistIndex",
      "collectedDecisions",
      "analysisBatchInvocationIds",
      "specialistDecisionsResult",
      "decisionComparisonResult",
    ],
  },
  "confirm-refinement": {
    input: [
      "specialistDecisionsResult",
      "decisionComparisonResult",
      "specialistComparisonContext",
      "synthesisAssignments",
      "analysisAssessment",
      "analysisRepresentatives",
      "analysisRefinement",
    ],
    output: [
      "analysisRefinement",
      "preparedSpecialistRequests",
      "synthesisAssignments",
      "currentSpecialistIndex",
      "collectedDecisions",
      "analysisBatchInvocationIds",
      "specialistDecisionsResult",
      "decisionComparisonResult",
    ],
  },
  "run-ceo-synthesis": {
    input: [
      "specialistDecisionsResult",
      "decisionComparisonResult",
      "specialistComparisonContext",
      "synthesisAssignments",
      "directionGovernanceResult",
      "analysisRepresentatives",
      "approvalResult",
    ],
    output: [
      "synthesisResult",
      "directionReview",
      "directionAction",
      "directionGovernanceResult",
      "phaseACompletion",
    ],
  },
  "human-direction-review": {
    input: ["directionReview"],
    output: [
      "directionAction",
      "directionGovernanceResult",
      "phaseACompletion",
    ],
  },
  "finalize-direction-review": {
    input: ["directionAction"],
    output: ["directionGovernanceResult", "phaseACompletion"],
  },
} as const satisfies Record<
  string,
  {
    input: readonly (keyof PhaseAState)[];
    output: readonly (keyof PhaseAState)[];
  }
>;

type PhaseADataFlow = typeof phaseADataFlow;

export type PhaseANodeInput<Node extends keyof PhaseADataFlow> = Pick<
  PhaseAState,
  PhaseADataFlow[Node]["input"][number]
>;

export type PhaseANodeOutput<Node extends keyof PhaseADataFlow> = Partial<
  Pick<PhaseAState, PhaseADataFlow[Node]["output"][number]>
>;
