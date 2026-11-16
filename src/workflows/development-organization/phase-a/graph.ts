import { END, START, StateGraph } from "@langchain/langgraph";
import { phaseAState } from "./state.js";
import {
  createStaffingSetupGraph,
  type StaffingSetupGraphOptions,
} from "./staffing-setup/graph.js";

export function createPhaseAGraph(options: StaffingSetupGraphOptions = {}) {
  // 1. Register Workflow Nodes
  // The compiled Subgraph shares only inputs and its published outcome.
  const graph = new StateGraph(phaseAState).addNode(
    "staffing-setup",
    createStaffingSetupGraph(options)
  );

  // 2. Connect Execution Edges
  // Future Decision routing must require an approved outcome; END alone grants nothing.
  graph.addEdge(START, "staffing-setup");
  graph.addEdge("staffing-setup", END);

  // 3. Compile Graph
  return graph.compile();
}
