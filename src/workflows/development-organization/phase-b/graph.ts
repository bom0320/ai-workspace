import { END, START, StateGraph } from "@langchain/langgraph";
import type {
  RunWorkDecompositionOptions,
  WorkItem,
} from "@/application/work-decomposition/index.js";
import { createPlanWorkItemNode } from "./features/planning/nodes/plan-work-item.js";
import type { planWorkItem } from "./features/planning/plan-work-item.js";
import { createRunWorkDecompositionNode } from "./features/work-decomposition/nodes/run-work-decomposition.js";
import { phaseBInput, phaseBState, type PhaseBState } from "./state.js";

export type PhaseBGraphOptions = RunWorkDecompositionOptions & {
  planning?: Omit<Parameters<typeof planWorkItem>[0], "phaseB"> & {
    selectWorkItemIds: (workItems: readonly WorkItem[]) => readonly string[];
  };
};

function routeAfterPlanning(state: PhaseBState) {
  return state.pendingPlanningIds?.length &&
    state.planningResults?.at(-1)?.result.status !== "failed"
    ? "plan-work-item"
    : END;
}

export function createPhaseBGraph({
  planning,
  ...decompositionOptions
}: PhaseBGraphOptions = {}) {
  const selectWorkItemIds = planning?.selectWorkItemIds;

  return new StateGraph({ state: phaseBState, input: phaseBInput })
    .addNode(
      "run-work-decomposition",
      createRunWorkDecompositionNode(decompositionOptions)
    )
    .addNode("select-planning-work-items", (state) => {
      const proposal = state.workDecompositionResult;
      if (proposal?.status !== "proposed" || !selectWorkItemIds) return {};
      const validIds = new Set(proposal.workItems.map(({ id }) => id));
      const selectedIds = selectWorkItemIds(
        structuredClone(proposal.workItems)
      );
      if (
        !Array.isArray(selectedIds) ||
        [...selectedIds].some((id) => !validIds.has(id))
      ) {
        throw new Error("Planning selection contains an unknown Work Item ID.");
      }
      return {
        pendingPlanningIds: [...new Set(selectedIds)],
        planningResults: [],
      };
    })
    .addNode("plan-work-item", createPlanWorkItemNode(planning))
    .addEdge(START, "run-work-decomposition")
    .addConditionalEdges(
      "run-work-decomposition",
      (state) =>
        selectWorkItemIds &&
        state.workDecompositionResult?.status === "proposed"
          ? "select-planning-work-items"
          : END,
      ["select-planning-work-items", END]
    )
    .addConditionalEdges("select-planning-work-items", routeAfterPlanning, [
      "plan-work-item",
      END,
    ])
    .addConditionalEdges("plan-work-item", routeAfterPlanning, [
      "plan-work-item",
      END,
    ])
    .compile()
    .withConfig({ recursionLimit: Number.MAX_SAFE_INTEGER });
}
