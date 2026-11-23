import { executeWorkItemPlanning } from "../execution/execute-work-item-planning.js";
import type { PhaseBState } from "../../../state.js";
import { beginValidatedWorkItemExecutionSource } from "@/application/governance/authorization/features/work-item-execution/flow/register-work-item-execution-source.js";

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
    const handoff = state.handoffResult;
    if (handoff?.status !== "accepted")
      throw new Error("Detailed Planning requires an accepted Handoff.");
    const recordSource = beginValidatedWorkItemExecutionSource(
      handoff.handoff,
      proposal,
      workItem,
      repositoryPath
    );
    const result =
      workItem.workType === "read-only"
        ? { status: "read-only" as const }
        : await executeWorkItemPlanning({
            repositoryPath,
            limits,
            planner,
            executionCeiling: handoff.handoff.executionDelegation.grant,
            phaseB: {
              approvedDecisionId: proposal.approvedDecisionId,
              workItem,
            },
          });
    const readiness =
      result.status === "read-only"
        ? recordSource()
        : result.status === "completed"
          ? recordSource(result.task)
          : {};
    return {
      pendingPlanningIds,
      planningResults: [
        ...(state.planningResults ?? []),
        {
          workItemId: workItem.id,
          result,
          ...readiness,
        },
      ],
    };
  };
}
