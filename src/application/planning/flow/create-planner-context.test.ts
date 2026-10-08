import { describe, expect, it } from "vitest";

import type { PlanningState } from "../model/state.js";
import { createPlannerContext } from "./create-planner-context.js";

function createState(): PlanningState {
  return {
    goal: {
      objective: "Implement the goal",
      targetRepository: "example",
      constraints: ["Keep changes scoped"],
    },
    repository: {
      repositoryRoot: "/repositories/example",
      repositoryName: "example",
      fileTree: ["package.json", "src/cli.ts"],
      packageScripts: { test: "vitest run" },
      instructions: "Repository instructions",
    },
    inspectedFiles: [{ path: "src/cli.ts", content: "// File content" }],
  };
}

describe("createPlannerContext", () => {
  it("projects planning facts without exposing repositoryRoot", () => {
    const state = createState();
    const input = createPlannerContext(state);

    expect(input).toEqual({
      goal: state.goal,
      repository: {
        name: "example",
        fileTree: state.repository.fileTree,
        packageScripts: state.repository.packageScripts,
        instructions: state.repository.instructions,
      },
      inspectedFiles: state.inspectedFiles,
    });
    expect(input.repository).not.toHaveProperty("repositoryRoot");
    expect(input).not.toHaveProperty("repositoryRoot");
  });

  it("preserves optional instructions when they are absent", () => {
    const state = createState();
    delete state.repository.instructions;

    expect(createPlannerContext(state).repository.instructions).toBeUndefined();
    expect(state.repository).not.toHaveProperty("instructions");
  });

  it("shares existing fact references without mutating state", () => {
    const state = createState();
    const before = structuredClone(state);
    Object.freeze(state.goal);
    Object.freeze(state.repository);
    Object.freeze(state.repository.fileTree);
    Object.freeze(state.repository.packageScripts);
    Object.freeze(state.inspectedFiles);
    Object.freeze(state);

    const input = createPlannerContext(state);

    expect(input.goal).toBe(state.goal);
    expect(input.repository.fileTree).toBe(state.repository.fileTree);
    expect(input.repository.packageScripts).toBe(state.repository.packageScripts);
    expect(input.inspectedFiles).toBe(state.inspectedFiles);
    expect(state).toEqual(before);
  });
});
