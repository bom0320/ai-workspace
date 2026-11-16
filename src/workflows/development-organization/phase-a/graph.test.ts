import { describe, expect, it } from "vitest";
import { createPhaseAGraph } from "./graph.js";

describe("Phase A orchestration", () => {
  it("registers the compiled Staffing Setup Subgraph without duplicating its internal Nodes", () => {
    const graph = createPhaseAGraph().getGraph();
    expect(Object.keys(graph.nodes).sort()).toEqual([
      "__end__",
      "__start__",
      "staffing-setup",
    ]);
    expect(graph.edges.map(({ source, target }) => [source, target])).toEqual([
      ["__start__", "staffing-setup"],
      ["staffing-setup", "__end__"],
    ]);
  });
});
