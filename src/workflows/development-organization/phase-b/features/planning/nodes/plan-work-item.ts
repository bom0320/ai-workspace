import { planWorkItem } from "../execution/plan-work-item.js";
import type { PhaseBState } from "../../../state.js";

export function createPlanWorkItemNode(
  options?: Omit<Parameters<typeof planWorkItem>[0], "phaseB">
) {
  return async (state: PhaseBState): Promise<Partial<PhaseBState>> => {
    const proposal = state.workDecompositionResult;
    const [workItemId, ...pendingPlanningIds] = state.pendingPlanningIds ?? [];
    const workItem =
      proposal?.status === "proposed"
        ? proposal.workItems.find(({ id }) => id === workItemId)
        : undefined;
    if (!options || !workItem || proposal?.status !== "proposed") {
      throw new Error("Detailed Planning requires a selected Work Item.");
    }

    const { repositoryPath, limits, planner } = options;
    const result = await planWorkItem({
      repositoryPath,
      limits,
      planner,
      phaseB: { approvedDecisionId: proposal.approvedDecisionId, workItem },
    });
    return {
      pendingPlanningIds,
      planningResults: [
        ...(state.planningResults ?? []),
        { workItemId: workItem.id, result },
      ],
    };
  };
}
