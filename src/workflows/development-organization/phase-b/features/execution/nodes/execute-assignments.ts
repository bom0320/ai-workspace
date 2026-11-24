import type { createPlanWorkItemNode } from "../../planning/nodes/plan-work-item.js";
import type { PhaseBState } from "../../../state.js";
import {
  executeAssignmentPlan,
  type CollaborativeExecutionOptions,
} from "../coordination/execute-assignment-plan.js";

export function createExecuteAssignmentsNode(
  options?: CollaborativeExecutionOptions,
  planDraft?: ReturnType<typeof createPlanWorkItemNode>
) {
  const configured = options && structuredClone(options);
  return async (state: PhaseBState): Promise<Partial<PhaseBState>> => {
    const { handoffResult, assignmentPlanResult, selectedWorkItemIds } = state;
    if (
      !configured ||
      !selectedWorkItemIds?.length ||
      handoffResult?.status !== "accepted" ||
      assignmentPlanResult?.status !== "prepared"
    )
      return {};
    const drafts = new Map<
      string,
      NonNullable<PhaseBState["planningResults"]>[number]
    >();
    const assignmentExecutionResult = await executeAssignmentPlan(
      handoffResult.handoff,
      assignmentPlanResult.plan.id,
      selectedWorkItemIds,
      configured,
      planDraft && {
        run: async (workItemId, assignmentId) => {
          const planned = await planDraft(
            {
              ...state,
              pendingPlanningIds: [workItemId],
              planningResults: [],
            },
            assignmentId
          );
          const draft = planned.planningResults?.[0];
          if (!draft) return false;
          drafts.set(assignmentId, draft);
          return draft.result.status === "completed";
        },
      }
    );
    if (!planDraft || "failure" in assignmentExecutionResult)
      return { assignmentExecutionResult };
    return {
      assignmentExecutionResult,
      pendingPlanningIds: [],
      deferredDetailedPlanningIds:
        assignmentExecutionResult.deferredPlanningWorkItemIds ?? [],
      planningResults: [...(state.planningResults ?? []), ...drafts.values()],
    };
  };
}
