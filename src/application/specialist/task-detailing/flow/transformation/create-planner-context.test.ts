import { describe, expect, it } from "vitest";

import type { PlanningState } from "../../model/state.js";
import { createPlannerContext } from "./create-planner-context.js";

const limits = { maxRounds: 4, maxFilesPerRequest: 5, maxTotalFiles: 12 };

function createState(): PlanningState {
  return {
    goal: {
      objective: "Implement the goal",
      targetRepository: "example",
      constraints: ["Keep changes scoped"],
    },
    detail: {
      objective: "Improve error feedback",
      deliverable: "Actionable error descriptions",
      direction: "Keep the existing input contract",
    },
    assignmentDetail: {
      specialist: {
        id: "engineer",
        role: "Engineer",
        objective: "Improve feedback",
      },
      workItem: {
        id: "work-1",
        objective: "Improve feedback",
        deliverable: "Clear errors",
      },
      executionBounds: {
        readScopes: [],
        writeScopes: [],
        shellCommands: ["git diff --check"],
        budget: { maxExecutions: 1, maxTimeoutMs: 5000 },
      },
    },
    repository: {
      repositoryRoot: "/repositories/example",
      repositoryName: "example",
      fileTree: ["package.json", "src/cli.ts"],
    },
    inspectedFiles: [{ path: "src/cli.ts", content: "// File content" }],
  };
}

describe("createPlannerContext", () => {
  it("recalculates remaining budget from the current state without mutating limits", () => {
    const state = createState();
    const budget = Object.freeze({
      maxRounds: 4,
      maxFilesPerRequest: 5,
      maxTotalFiles: 2,
    });
    expect(createPlannerContext(state, budget).remainingInspectionBudget).toBe(
      1
    );
    state.inspectedFiles.push({ path: "README.md", content: "read" });
    expect(createPlannerContext(state, budget).remainingInspectionBudget).toBe(
      0
    );
    expect(createPlannerContext(state, budget).limits).toBe(budget);
  });
  it("projects planning facts without exposing repositoryRoot", () => {
    const state = createState();
    const input = createPlannerContext(state, limits);

    expect(input).toEqual({
      goal: state.goal,
      detail: state.detail,
      assignmentDetail: state.assignmentDetail,
      repository: {
        name: "example",
        fileTree: state.repository.fileTree,
      },
      inspectedFiles: state.inspectedFiles,
      limits,
      remainingInspectionBudget: 11,
    });
    expect(input.repository).not.toHaveProperty("repositoryRoot");
    expect(input).not.toHaveProperty("repositoryRoot");
  });

  it("shares existing fact references without mutating state", () => {
    const state = createState();
    const before = structuredClone(state);
    Object.freeze(state.goal);
    Object.freeze(state.repository);
    Object.freeze(state.repository.fileTree);
    Object.freeze(state.inspectedFiles);
    Object.freeze(state);

    const input = createPlannerContext(state, limits);

    expect(input.goal).toBe(state.goal);
    expect(input.repository.fileTree).toBe(state.repository.fileTree);
    expect(input.inspectedFiles).toBe(state.inspectedFiles);
    expect(state).toEqual(before);
  });
});
