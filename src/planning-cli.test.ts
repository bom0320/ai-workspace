import { basename, resolve } from "node:path";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { planTask, type PlanningState } from "@/application/planning/index.js";
import { executeTask } from "@/application/execution/index.js";
import type { TaskContract } from "@/contracts/task.js";
import { runPlanningCli } from "./planning-cli.js";

vi.mock("@/application/planning/index.js", () => ({ planTask: vi.fn() }));
vi.mock("@/application/execution/index.js", () => ({ executeTask: vi.fn() }));

const task: TaskContract = {
  id: "task-001", goalId: "goal-001", objective: "Clarify README",
  targetRepository: "example", allowedPaths: ["README.md"], forbiddenPaths: [],
  constraints: [], acceptanceCriteria: ["Introduction is clear"], verification: [],
};
const state: PlanningState = {
  goal: { objective: task.objective, targetRepository: "example" },
  repository: { repositoryRoot: "/repositories/example", repositoryName: "example", fileTree: ["README.md"], packageScripts: {} },
  inspectedFiles: [],
};
const planTaskMock = vi.mocked(planTask);

beforeEach(() => {
  vi.resetAllMocks();
  vi.spyOn(console, "log").mockImplementation(() => {});
  vi.spyOn(console, "error").mockImplementation(() => {});
  planTaskMock.mockResolvedValue({ status: "completed", task, state, rounds: 2 });
});

afterEach(() => { vi.restoreAllMocks(); });

describe("Planning CLI", () => {
  it("rejects a missing repository path", async () => {
    expect(await runPlanningCli([])).toBe(1);
    expect(console.error).toHaveBeenCalledWith("Error: Repository path is required.");
    expect(planTaskMock).not.toHaveBeenCalled();
  });

  it.each([undefined, "", "   "])("rejects a missing or blank objective: %j", async (objective) => {
    expect(await runPlanningCli(objective === undefined ? ["."] : [".", objective])).toBe(1);
    expect(console.error).toHaveBeenCalledWith("Error: Objective is required.");
    expect(planTaskMock).not.toHaveBeenCalled();
  });

  it("creates a goal and invokes planTask without injecting a planner", async () => {
    expect(await runPlanningCli([".", "Clarify README"])).toBe(0);
    expect(planTaskMock).toHaveBeenCalledWith({
      goal: { objective: "Clarify README", targetRepository: basename(resolve(".")) },
      repositoryPath: ".",
      limits: { maxRounds: 4, maxFilesPerRequest: 5, maxTotalFiles: 12 },
    });
  });

  it("prints a completed task contract and never calls executeTask", async () => {
    expect(await runPlanningCli([".", "Clarify README"])).toBe(0);
    expect(console.log).toHaveBeenCalledWith("Planning: completed");
    expect(console.log).toHaveBeenCalledWith("Rounds: 2");
    expect(console.log).toHaveBeenCalledWith("\nTask Contract:");
    expect(console.log).toHaveBeenCalledWith(JSON.stringify(task, null, 2));
    expect(executeTask).not.toHaveBeenCalled();
  });

  it("reports workflow failure with exit code 1", async () => {
    planTaskMock.mockResolvedValue({ status: "failed", state, rounds: 4, reason: "Planning round limit reached." });
    expect(await runPlanningCli([".", "Clarify README"])).toBe(1);
    expect(console.error).toHaveBeenCalledWith("Planning: failed");
    expect(console.error).toHaveBeenCalledWith("Rounds: 4");
    expect(console.error).toHaveBeenCalledWith("Reason: Planning round limit reached.");
    expect(executeTask).not.toHaveBeenCalled();
  });

  it("reports unexpected errors without a stack trace and returns exit code 1", async () => {
    planTaskMock.mockRejectedValue(new Error("Codex planner timed out"));
    expect(await runPlanningCli([".", "Clarify README"])).toBe(1);
    expect(console.error).toHaveBeenCalledWith("Error: Planning failed: Codex planner timed out");
    expect(executeTask).not.toHaveBeenCalled();
  });
});
