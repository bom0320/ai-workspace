import type { PhaseBState } from "./state.js";

export const phaseBDataFlow = {
  "run-work-decomposition": {
    input: ["handoff"],
    output: ["handoffResult", "workDecompositionResult"],
  },
  "select-work-items": {
    input: ["workDecompositionResult"],
    output: ["selectedWorkItemIds"],
  },
  "assign-specialists": {
    input: [
      "handoff",
      "handoffResult",
      "workDecompositionResult",
      "selectedWorkItemIds",
    ],
    output: ["assignmentPlanResult"],
  },
  "execute-assignments": {
    input: [
      "handoff",
      "handoffResult",
      "assignmentPlanResult",
      "selectedWorkItemIds",
    ],
    output: ["assignmentExecutionResult"],
  },
  "integrate-assignments": {
    input: ["handoff", "assignmentExecutionResult"],
    output: ["workItemResults"],
  },
} as const satisfies Record<
  string,
  {
    input: readonly (keyof PhaseBState)[];
    output: readonly (keyof PhaseBState)[];
  }
>;

type PhaseBDataFlow = typeof phaseBDataFlow;

export type PhaseBNodeInput<Node extends keyof PhaseBDataFlow> = Pick<
  PhaseBState,
  PhaseBDataFlow[Node]["input"][number]
>;

export type PhaseBNodeOutput<Node extends keyof PhaseBDataFlow> = Partial<
  Pick<PhaseBState, PhaseBDataFlow[Node]["output"][number]>
>;
