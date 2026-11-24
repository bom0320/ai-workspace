import type { PhaseBState } from "../../../state.js";

// Runs once after selection. Detailed Planning iterations append their results.
export function createInitializePlanningNode(queueDetailedPlanning: boolean) {
  return ({ selectedWorkItemIds }: PhaseBState): Partial<PhaseBState> => ({
    planningResults: [],
    ...(queueDetailedPlanning && {
      pendingPlanningIds: [...(selectedWorkItemIds ?? [])],
    }),
  });
}
