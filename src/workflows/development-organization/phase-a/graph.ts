import { END, START, StateGraph } from "@langchain/langgraph";
import { phaseAState } from "./state.js";
import {
  createRunStaffingNode,
  type StaffingExecutionOptions,
} from "./nodes/run-staffing.js";
import { evaluateStaffingApproval } from "./nodes/evaluate-staffing-approval.js";
import { loadSystemPolicy } from "./nodes/load-system-policy.js";

export function createPhaseAGraph(options: StaffingExecutionOptions = {}) {
  // 1. Register Workflow Nodes
  const graph = new StateGraph(phaseAState)
    .addNode("load-system-policy", loadSystemPolicy)
    .addNode("run-staffing", createRunStaffingNode(options))
    .addNode("evaluate-staffing-approval", evaluateStaffingApproval);

  // 2. Connect Execution Edges
  graph.addEdge(START, "load-system-policy");
  graph.addConditionalEdges("load-system-policy", (state) =>
    state.policyLookup?.status === "ready" ? "run-staffing" : END
  );
  graph.addConditionalEdges("run-staffing", (state) =>
    state.staffingResult?.status === "proposed"
      ? "evaluate-staffing-approval"
      : END
  );
  graph.addEdge("evaluate-staffing-approval", END);

  // Approval may persist Scope: no retry policy or resume mechanism is installed.
  // 3. Compile Graph
  return graph.compile();
}
