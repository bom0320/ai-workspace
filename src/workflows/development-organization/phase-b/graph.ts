import { END, START, StateGraph } from "@langchain/langgraph";
import type { RunWorkDecompositionOptions } from "@/application/work-decomposition/index.js";
import { createPlanWorkItemNode } from "./features/planning/nodes/plan-work-item.js";
import {
  createSelectPlanningWorkItemsNode,
  type SelectWorkItemIds,
} from "./features/planning/nodes/select-planning-work-items.js";
import type { executeWorkItemPlanning } from "./features/planning/execution/execute-work-item-planning.js";
import { createRunWorkDecompositionNode } from "./features/work-decomposition/nodes/run-work-decomposition.js";
import { phaseBInput, phaseBState } from "./state.js";

import {
  createExecuteWorkItemNode,
  type PhaseBExecutionOptions,
} from "./features/execution/nodes/execute-work-item.js";

export type PhaseBGraphOptions = Omit<
  RunWorkDecompositionOptions,
  "executionCeiling"
> & {
  planning?: Omit<
    Parameters<typeof executeWorkItemPlanning>[0],
    "phaseB" | "executionCeiling"
  > & {
    selectWorkItemIds: SelectWorkItemIds;
    execution?: PhaseBExecutionOptions;
  };
};

export function createPhaseBGraph({
  planning,
  ...decompositionOptions
}: PhaseBGraphOptions = {}) {
  const selectWorkItemIds = planning?.selectWorkItemIds;
  const execution = planning?.execution;

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
    .addNode("plan-work-item", createPlanWorkItemNode(planning))
    .addNode(
      "execute-work-item",
      createExecuteWorkItemNode(planning?.repositoryPath, execution)
    );

  // 2. Connect Execution Edges
  graph.addEdge(START, "run-work-decomposition");
  graph.addConditionalEdges(
    "run-work-decomposition",
    (state) =>
      selectWorkItemIds &&
      state.handoffResult?.status === "accepted" &&
      state.workDecompositionResult?.status === "proposed"
        ? "select-planning-work-items"
        : END,
    ["select-planning-work-items", END]
  );
  graph.addConditionalEdges(
    "select-planning-work-items",
    (state) => (state.pendingPlanningIds?.length ? "plan-work-item" : END),
    ["plan-work-item", END]
  );
  graph.addConditionalEdges(
    "plan-work-item",
    (state) => {
      const latest = state.planningResults?.at(-1);
      if (
        !latest ||
        (latest.result.status !== "completed" &&
          latest.result.status !== "read-only") ||
        !latest.executionSourceId ||
        latest.executionBlockedReason
      )
        return END;
      if (state.pendingPlanningIds?.length) return "plan-work-item";
      return execution ? "execute-work-item" : END;
    },
    ["plan-work-item", "execute-work-item", END]
  );
  graph.addEdge("execute-work-item", END);

  // 3. Compile Graph
  return graph
    .compile()
    .withConfig({ recursionLimit: Number.MAX_SAFE_INTEGER });
}
