import type { PhaseBHandoff } from "../handoff/input.js";
import type { WorkDecompositionOutput } from "../work-decomposition/output.js";

export type AssignmentPlanningInput = {
  handoff: Pick<PhaseBHandoff, "decision" | "executionDelegation">;
  proposal: Extract<WorkDecompositionOutput, { status: "proposed" }>;
  selectedWorkItemIds: readonly string[];
};
