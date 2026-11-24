import {
  getPreparedAssignmentPlan,
  getWorkerAssignmentPlanningContext,
} from "@/application/governance/index.js";
import { executeWorkItemPlanning } from "../execution/execute-work-item-planning.js";
import type { PhaseBState } from "../../../state.js";
import { beginValidatedWorkItemExecutionSource } from "@/application/governance/authorization/features/work-item-execution/flow/register-work-item-execution-source.js";

export function createPlanWorkItemNode(
  options:
    | Omit<
        Parameters<typeof executeWorkItemPlanning>[0],
        "phaseB" | "predecessorResults"
      >
    | undefined,
  mode: "draft" | "execution-source"
) {
  return async (
    state: PhaseBState,
    workerAssignmentId?: string
  ): Promise<Partial<PhaseBState>> => {
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
    let workerContext:
      ReturnType<typeof getWorkerAssignmentPlanningContext> | undefined;
    if (mode === "draft") {
      if (state.assignmentPlanResult?.status !== "prepared")
        throw new Error(
          "Detailed Planning draft requires a prepared Assignment Plan."
        );
      const planId = state.assignmentPlanResult.plan.id;
      if (workerAssignmentId) {
        workerContext = getWorkerAssignmentPlanningContext(
          handoff.handoff,
          planId,
          workerAssignmentId
        );
        if (workerContext.workItem.id !== workItemId)
          throw new Error(
            "Worker Assignment does not belong to the selected Work Item."
          );
      } else {
        getPreparedAssignmentPlan(handoff.handoff, planId);
      }
    }
    const recordSource =
      mode === "execution-source"
        ? beginValidatedWorkItemExecutionSource(
            handoff.handoff,
            proposal,
            workItem,
            repositoryPath
          )
        : undefined;
    const result =
      workItem.workType === "read-only"
        ? { status: "read-only" as const }
        : await executeWorkItemPlanning({
            repositoryPath,
            limits,
            planner,
            predecessorResults: workerContext?.priorResults,
            executionCeiling: handoff.handoff.executionDelegation.grant,
            phaseB: {
              approvedDecisionId: proposal.approvedDecisionId,
              workItem: workerContext
                ? {
                    ...workerContext.workItem,
                    objective: workerContext.assignment.objective,
                    deliverable: workerContext.assignment.deliverable,
                  }
                : workItem,
            },
          });
    const readiness =
      result.status === "read-only"
        ? recordSource?.()
        : result.status === "completed"
          ? recordSource?.(result.task)
          : {};
    return {
      pendingPlanningIds,
      planningResults: [
        ...(state.planningResults ?? []),
        {
          workItemId: workItem.id,
          ...(workerContext &&
            state.assignmentPlanResult?.status === "prepared" && {
              assignmentId: workerContext.assignment.id,
              assignmentPlanId: state.assignmentPlanResult.plan.id,
            }),
          result,
          ...readiness,
        },
      ],
    };
  };
}
