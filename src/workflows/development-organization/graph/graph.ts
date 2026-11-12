import { END, START, StateGraph } from "@langchain/langgraph";
import { developmentOrganizationState } from "./state.js";
import { loadSystemPolicy } from "./nodes/load-system-policy.js";

export function createDevelopmentOrganizationGraph() {
  // 1. Register Workflow Nodes
  const graph = new StateGraph(developmentOrganizationState).addNode(
    "load-system-policy",
    loadSystemPolicy
  );

  // 2. Connect Execution Edges
  graph.addEdge(START, "load-system-policy");
  graph.addEdge("load-system-policy", END);

  // 3. Compile Graph
  return graph.compile();
}
