import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { basename, join, relative, resolve } from "node:path";

import { afterEach, describe, expect, it, vi } from "vitest";

import type { GoalSpec } from "@/contracts/goal.js";
import type { TaskContract } from "@/contracts/task.js";

import * as codex from "../planner/codex-planner.js";
import { inspectRepository } from "./inspect-repository.js";
import { planTask } from "./plan-task.js";
import type { Planner } from "./planning-loop.js";

const temporaryDirectories: string[] = [];
const goal: GoalSpec = {
  objective: "Implement the goal",
  targetRepository: "example",
  constraints: ["Keep changes scoped"],
};
const task: TaskContract = {
  id: "task-001", goalId: "goal-001", objective: goal.objective,
  targetRepository: goal.targetRepository, allowedPaths: ["example.ts"],
  forbiddenPaths: [], constraints: goal.constraints!,
  acceptanceCriteria: ["The goal is implemented"], verification: ["pnpm test"],
};
const limits = { maxRounds: 3, maxFilesPerRequest: 2, maxTotalFiles: 2 };

function createRepository(): string {
  const root = mkdtempSync(join(tmpdir(), "ai-workspace-plan-task-"));
  temporaryDirectories.push(root);
  mkdirSync(join(root, ".git"));
  writeFileSync(join(root, "example.ts"), "// Example 내용\n");
  writeFileSync(join(root, "AGENTS.md"), "Keep changes minimal");
  writeFileSync(join(root, "package.json"), '{"scripts":{"test":"vitest run"}}');
  return root;
}

afterEach(() => {
  vi.restoreAllMocks();
  for (const directory of temporaryDirectories.splice(0)) {
    rmSync(directory, { recursive: true });
  }
});

describe("planTask", () => {
  it("resolves the repository and passes its overview and unchanged goal to the injected planner", async () => {
    const root = createRepository();
    const repositoryPath = relative(process.cwd(), root);
    const resolvedRoot = resolve(repositoryPath);
    const before = structuredClone(goal);
    const planner = vi.fn<Planner>().mockResolvedValue({ type: "complete", task });
    const createPlanner = vi.spyOn(codex, "createCodexPlanner");

    const result = await planTask({ goal, repositoryPath, limits, planner });

    expect(planner).toHaveBeenCalledOnce();
    const initialState = planner.mock.calls[0][0];
    expect(initialState).toEqual({
      goal, repository: inspectRepository(resolvedRoot), inspectedFiles: [],
    });
    expect(initialState.goal).toBe(goal);
    expect(initialState.repository.repositoryRoot).toBe(resolvedRoot);
    expect(initialState.repository.repositoryName).toBe(basename(resolvedRoot));
    expect(initialState.repository.packageScripts).toEqual({ test: "vitest run" });
    expect(initialState.repository.instructions).toBe("Keep changes minimal");
    expect(result).toEqual({ status: "completed", task, state: initialState, rounds: 1 });
    expect(goal).toEqual(before);
    expect(createPlanner).not.toHaveBeenCalled();
  });

  it("connects real inspection and planning loop for inspect then complete", async () => {
    const root = createRepository();
    const before = structuredClone(goal);
    const planner = vi.fn<Planner>()
      .mockResolvedValueOnce({ type: "inspect", request: { paths: ["example.ts"] } })
      .mockResolvedValueOnce({ type: "complete", task });

    const result = await planTask({ goal, repositoryPath: root, limits, planner });

    expect(result.status).toBe("completed");
    expect(result.rounds).toBe(2);
    expect(planner.mock.calls[0][0].inspectedFiles).toEqual([]);
    expect(planner.mock.calls[1][0].inspectedFiles).toEqual([
      { path: "example.ts", content: "// Example 내용\n" },
    ]);
    expect(result.state).toBe(planner.mock.calls[1][0]);
    expect(planner.mock.calls[0][0]).not.toBe(result.state);
    expect(goal).toEqual(before);
  });

  it("propagates repository resolution errors before calling the planner", async () => {
    const root = createRepository();
    const planner = vi.fn<Planner>();
    await expect(planTask({ goal, repositoryPath: join(root, "missing"), limits, planner }))
      .rejects.toThrow("Repository path does not exist");
    mkdirSync(join(root, "not-a-repository"));
    await expect(planTask({ goal, repositoryPath: join(root, "not-a-repository"), limits, planner }))
      .rejects.toThrow("Path is not a Git repository");
    expect(planner).not.toHaveBeenCalled();
  });

  it("uses the default Codex planner factory without invoking the real CLI in tests", async () => {
    const planner = vi.fn<Planner>().mockResolvedValue({ type: "complete", task });
    const createPlanner = vi.spyOn(codex, "createCodexPlanner").mockReturnValue(planner);
    const result = await planTask({ goal, repositoryPath: createRepository(), limits });
    expect(createPlanner).toHaveBeenCalledOnce();
    expect(planner).toHaveBeenCalledOnce();
    expect(result.status).toBe("completed");
  });

  it("passes workflow failures from the loop through unchanged", async () => {
    const planner = vi.fn<Planner>().mockResolvedValue({ type: "inspect", request: { paths: [] } });
    const result = await planTask({ goal, repositoryPath: createRepository(), limits, planner });
    expect(result).toMatchObject({ status: "failed", rounds: 1, reason: "No new inspection context requested." });
    expect(result.state).toBe(planner.mock.calls[0][0]);
  });
});
