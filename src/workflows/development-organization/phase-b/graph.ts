import type { CollaborativeExecutionOptions } from "./features/execution/coordination/execute-assignment-plan.js";
import { END, START, StateGraph } from "@langchain/langgraph";
import type { RunWorkDecompositionOptions } from "@/application/work-decomposition/index.js";
import type { AssignmentPlanAgent } from "@/application/planning/index.js";
import { createPlanAssignmentsNode } from "./features/planning/nodes/plan-assignments.js";
import { createExecuteAssignmentsNode } from "./features/execution/nodes/execute-assignments.js";
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
    .addNode(
      "plan-assignments",
      createPlanAssignmentsNode(
        assignment?.agent,
        !!detailed,
        workItemExecution?.workItemId
      )
    )
    .addNode(
      "execute-assignments",
      createExecuteAssignmentsNode(assignmentExecution)
    )
    .addNode("block-detailed-planning", (state) => ({
      deferredDetailedPlanningIds: state.selectedWorkItemIds ?? [],
      detailedPlanningBlockedReason:
        "Phase B Detailed Planning requires a claimed Assignment Read context and Assignment-bound planning authorization.",
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
  graph.addConditionalEdges(
    "select-work-items",
    (state) => {
      if (!state.selectedWorkItemIds?.length)
        return workItemExecution ? "block-work-item-execution" : END;
      if (assignment) return "plan-assignments";
      return detailed
        ? "block-detailed-planning"
        : workItemExecution
          ? "block-work-item-execution"
          : END;
    },
    [
      "plan-assignments",
      "block-detailed-planning",
      "block-work-item-execution",
      END,
    ]
  );
  graph.addEdge("block-detailed-planning", END);
  graph.addConditionalEdges(
    "plan-assignments",
    (state) =>
      assignmentExecution && state.assignmentPlanResult?.status === "prepared"
        ? "execute-assignments"
        : END,
    ["execute-assignments", END]
  );
  graph.addEdge("execute-assignments", END);
  graph.addEdge("block-work-item-execution", END);

  // 3. Compile Graph
  return graph
    .compile()
    .withConfig({ recursionLimit: Number.MAX_SAFE_INTEGER });
}
