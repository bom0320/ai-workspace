import { END, START, StateGraph } from "@langchain/langgraph";
import { phaseAState } from "./state.js";
import { loadSystemPolicy } from "./nodes/load-system-policy.js";

export function createPhaseAGraph() {
  // 1. Register Workflow Nodes
  const graph = new StateGraph(phaseAState).addNode(
    "load-system-policy",
    loadSystemPolicy
  );

  // 2. Connect Execution Edges
  graph.addEdge(START, "load-system-policy");
  graph.addEdge("load-system-policy", END);

  // 3. Compile Graph
  return graph.compile();
}
