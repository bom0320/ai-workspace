import { END, START, StateGraph } from "@langchain/langgraph";
import type { RunWorkDecompositionOptions } from "@/application/work-decomposition/index.js";
import { createPlanWorkItemNode } from "./features/planning/nodes/plan-work-item.js";
import {
  createSelectPlanningWorkItemsNode,
  type SelectWorkItemIds,
} from "./features/planning/nodes/select-planning-work-items.js";
import type { planWorkItem } from "./features/planning/execution/plan-work-item.js";
import { createRunWorkDecompositionNode } from "./features/work-decomposition/nodes/run-work-decomposition.js";
import { phaseBInput, phaseBState, type PhaseBState } from "./state.js";

export type PhaseBGraphOptions = RunWorkDecompositionOptions & {
  planning?: Omit<Parameters<typeof planWorkItem>[0], "phaseB"> & {
    selectWorkItemIds: SelectWorkItemIds;
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

  // 1. Register Workflow Nodes
  const graph = new StateGraph({ state: phaseBState, input: phaseBInput })
    .addNode(
      "run-work-decomposition",
      createRunWorkDecompositionNode(decompositionOptions)
    )
    .addNode(
      "select-planning-work-items",
      createSelectPlanningWorkItemsNode(selectWorkItemIds)
    )
    .addNode("plan-work-item", createPlanWorkItemNode(planning));

  // 2. Connect Execution Edges
  graph.addEdge(START, "run-work-decomposition");
  graph.addConditionalEdges(
    "run-work-decomposition",
    (state) =>
      selectWorkItemIds && state.workDecompositionResult?.status === "proposed"
        ? "select-planning-work-items"
        : END,
    ["select-planning-work-items", END]
  );
  graph.addConditionalEdges("select-planning-work-items", routeAfterPlanning, [
    "plan-work-item",
    END,
  ]);
  graph.addConditionalEdges("plan-work-item", routeAfterPlanning, [
    "plan-work-item",
    END,
  ]);

  // 3. Compile Graph
  return graph
    .compile()
    .withConfig({ recursionLimit: Number.MAX_SAFE_INTEGER });
}
