import { executeWorkItemPlanning } from "../execution/execute-work-item-planning.js";
import type { PhaseBState } from "../../../state.js";
import { beginWorkItemExecutionSource } from "@/application/governance/authorization/features/work-item-execution/flow/register-work-item-execution-source.js";

export function createPlanWorkItemNode(
  options?: Omit<Parameters<typeof executeWorkItemPlanning>[0], "phaseB">
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
    const recordSource = beginWorkItemExecutionSource(
      proposal,
      workItem,
      repositoryPath
    );
    const result = await executeWorkItemPlanning({
      repositoryPath,
      limits,
      planner,
      ...(state.handoffResult?.status === "accepted" && {
        executionCeiling: state.handoffResult.handoff.executionDelegation.grant,
      }),
      phaseB: { approvedDecisionId: proposal.approvedDecisionId, workItem },
    });
    const executionSourceId =
      result.status === "completed" ? recordSource?.(result.task) : undefined;
    return {
      pendingPlanningIds,
      planningResults: [
        ...(state.planningResults ?? []),
        {
          workItemId: workItem.id,
          result,
          ...(executionSourceId && { executionSourceId }),
        },
      ],
    };
  };
}
