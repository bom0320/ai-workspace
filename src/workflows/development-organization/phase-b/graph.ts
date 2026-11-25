import type { CollaborativeExecutionOptions } from "./features/execution/coordination/execute-assignment-plan.js";
import { END, START, StateGraph } from "@langchain/langgraph";
import type { RunWorkDecompositionOptions } from "@/application/work-decomposition/index.js";
import type { AssignmentPlanAgent } from "@/application/planning/index.js";
import { createPrepareAssignmentsNode } from "./features/planning/nodes/prepare-assignments.js";
import { createInitializePlanningNode } from "./features/planning/nodes/initialize-planning.js";
import {
  createSelectWorkItemsNode,
  type SelectWorkItemIds,
} from "./features/planning/nodes/select-work-items.js";
import type { executeWorkItemPlanning } from "./features/planning/execution/execute-work-item-planning.js";
import { createRunWorkDecompositionNode } from "./features/work-decomposition/nodes/run-work-decomposition.js";
import { phaseBInput, phaseBState } from "./state.js";

import {
  createBlockedWorkItemExecutionNode,
  type PhaseBExecutionOptions,
} from "./features/execution/nodes/execute-work-item.js";

type DetailedPlanningOptions = Omit<
  Parameters<typeof executeWorkItemPlanning>[0],
  "phaseB" | "executionCeiling" | "predecessorResults"
>;

export type PhaseBGraphOptions = Omit<
  RunWorkDecompositionOptions,
  "executionCeiling"
> & {
  planning?: {
    selectWorkItemIds: SelectWorkItemIds;
    assignment?: {
      agent: AssignmentPlanAgent;
    };
    detailed?: DetailedPlanningOptions;
  };
  execution?: {
    assignment?: CollaborativeExecutionOptions;
    workItem?: PhaseBExecutionOptions;
  };
};

export function createPhaseBGraph({
  planning,
  execution,
  ...decompositionOptions
}: PhaseBGraphOptions = {}) {
  const { assignment, detailed, selectWorkItemIds } = planning ?? {};

  const { assignment: assignmentExecution, workItem: workItemExecution } =
    execution ?? {};

  // 1. Register Workflow Nodes
  const graph = new StateGraph({ state: phaseBState, input: phaseBInput })
    .addNode(
      "run-work-decomposition",
      createRunWorkDecompositionNode(decompositionOptions)
    )
    .addNode("select-work-items", createSelectWorkItemsNode(selectWorkItemIds))
    .addNode("initialize-planning", createInitializePlanningNode(false))
    .addNode(
      "prepare-assignments",
      createPrepareAssignmentsNode(
        assignment?.agent,
        !!detailed,
        !!assignmentExecution,
        workItemExecution?.workItemId
      )
    )
    .addNode("block-detailed-planning", (state) => ({
      deferredDetailedPlanningIds: state.selectedWorkItemIds ?? [],
      detailedPlanningBlockedReason:
        "Phase B Detailed Planning requires a claimed Assignment Read execution and an authorized Context provider.",
      ...createBlockedWorkItemExecutionNode(workItemExecution)(),
    }))
    .addNode(
      "block-work-item-execution",
      createBlockedWorkItemExecutionNode(workItemExecution)
    );

  // 2. Connect Execution Edges
  graph.addEdge(START, "run-work-decomposition");
  graph.addConditionalEdges(
    "run-work-decomposition",
    (state) =>
      state.handoffResult?.status === "accepted" &&
      state.workDecompositionResult?.status === "proposed"
        ? (assignment || detailed) && selectWorkItemIds
          ? "select-work-items"
          : workItemExecution
            ? "block-work-item-execution"
            : END
        : END,
    ["select-work-items", "block-work-item-execution", END]
  );
  graph.addEdge("select-work-items", "initialize-planning");
  graph.addConditionalEdges(
    "initialize-planning",
    (state) => {
      if (!state.selectedWorkItemIds?.length)
        return workItemExecution ? "block-work-item-execution" : END;
      if (assignment) return "prepare-assignments";
      return detailed
        ? "block-detailed-planning"
        : workItemExecution
          ? "block-work-item-execution"
          : END;
    },
    [
      "prepare-assignments",
      "block-detailed-planning",
      "block-work-item-execution",
      END,
    ]
  );
  graph.addEdge("block-detailed-planning", END);
  graph.addEdge("prepare-assignments", END);
  graph.addEdge("block-work-item-execution", END);

  // 3. Compile Graph
  return graph
    .compile()
    .withConfig({ recursionLimit: Number.MAX_SAFE_INTEGER });
}
