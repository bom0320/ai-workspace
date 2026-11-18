import { END, START, StateGraph } from "@langchain/langgraph";
import type { RunWorkDecompositionOptions } from "@/application/work-decomposition/index.js";
import { createRunWorkDecompositionNode } from "./features/work-decomposition/nodes/run-work-decomposition.js";
import { phaseBState } from "./state.js";

export type PhaseBGraphOptions = RunWorkDecompositionOptions;

export function createPhaseBGraph(options: PhaseBGraphOptions = {}) {
  return new StateGraph(phaseBState)
    .addNode("run-work-decomposition", createRunWorkDecompositionNode(options))
    .addEdge(START, "run-work-decomposition")
    .addEdge("run-work-decomposition", END)
    .compile();
}
