import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { basename, join, relative, resolve } from "node:path";

import { afterEach, describe, expect, it, vi } from "vitest";

import type { GoalSpec } from "@/contracts/goal.js";

import { type TaskDraft, type Planner } from "../protocol/planner.js";
import * as codex from "../planner/codex-planner.js";
import { inspectRepository } from "./inspection/inspect-repository.js";
import { planTask } from "./plan-task.js";
import { createPlannerContext } from "./transformation/create-planner-context.js";

const temporaryDirectories: string[] = [];
const goal: GoalSpec = {
  objective: "Implement the goal",
  targetRepository: "example",
  constraints: ["Keep changes scoped"],
};
const task: TaskDraft = {
  objective: goal.objective,
  targetRepository: goal.targetRepository,
  allowedPaths: ["example.ts"],
  forbiddenPaths: [],
  constraints: goal.constraints!,
  acceptanceCriteria: ["The goal is implemented"],
  verification: ["pnpm test"],
};
const limits = { maxRounds: 3, maxFilesPerRequest: 2, maxTotalFiles: 2 };

function createRepository(): string {
  const root = mkdtempSync(join(tmpdir(), "ai-workspace-plan-task-"));
  temporaryDirectories.push(root);
  mkdirSync(join(root, ".git"));
  writeFileSync(join(root, "example.ts"), "// Example 내용\n");
  writeFileSync(join(root, "AGENTS.md"), "Keep changes minimal");
  writeFileSync(
    join(root, "package.json"),
    '{"scripts":{"test":"vitest run"}}'
  );
  return root;
}

afterEach(() => {
  vi.restoreAllMocks();
  for (const directory of temporaryDirectories.splice(0)) {
    rmSync(directory, { recursive: true });
  }
});

describe("planTask", () => {
  it.each([
    "README.md의 소개 문구를 더 명확하게 수정해줘",
    "README의 문구를 수정해줘",
    "README의 오타를 수정해줘",
  ])(
    "completes trivial tasks without calling any Planner: %s",
    async (objective) => {
      const root = createRepository();
      writeFileSync(join(root, "README.md"), "Introduction");
      const planner = vi.fn<Planner>();
      const factory = vi.spyOn(codex, "createCodexPlanner");
      for (const injected of [planner, undefined]) {
        const result = await planTask({
          goal: { ...goal, objective },
          repositoryPath: root,
          limits,
          planner: injected,
        });
        expect(result).toMatchObject({
          status: "completed",
          rounds: 0,
          task: {
            allowedPaths: ["README.md"],
            verification: ["git diff --check"],
            id: expect.stringMatching(/^task-/),
            goalId: expect.stringMatching(/^goal-/),
            constraints: expect.arrayContaining(goal.constraints!),
          },
        });
      }
      expect(planner).not.toHaveBeenCalled();
      expect(factory).not.toHaveBeenCalled();
    }
  );

  it.each([
    "README 구조를 리팩토링하고 코드 예제를 추가해줘",
    "example.ts의 로직을 수정해줘",
    "README.md와 package.json의 문구를 수정해줘",
    "README.md를 삭제해줘",
  ])(
    "uses the existing Planner for non-trivial requests: %s",
    async (objective) => {
      const root = createRepository();
      writeFileSync(join(root, "README.md"), "Introduction");
      const planner = vi
        .fn<Planner>()
        .mockResolvedValue({ type: "complete", task });
      const factory = vi
        .spyOn(codex, "createCodexPlanner")
        .mockReturnValue(planner);
      const result = await planTask({
        goal: { ...goal, objective },
        repositoryPath: root,
        limits,
      });
      expect(result.rounds).toBe(1);
      expect(factory).toHaveBeenCalledOnce();
      expect(planner).toHaveBeenCalledOnce();
    }
  );
  it.each(["README 좀 더 정확하게 수정해줘", "README.md를 수정해줘"])(
    "supplies the explicitly named README before the first round: %s",
    async (objective) => {
      const root = createRepository();
      writeFileSync(
        join(root, "README.md"),
        "# Example\nAccurate project facts\n"
      );
      const planner = vi
        .fn<Planner>()
        .mockImplementation(async (state, currentLimits) => {
          const context = createPlannerContext(state, currentLimits);
          expect(context.inspectedFiles).toEqual([
            {
              path: "README.md",
              content: "# Example\nAccurate project facts\n",
            },
          ]);
          expect(context.repository.packageScripts).toEqual({
            test: "vitest run",
          });
          expect(context.repository.instructions).toBe("Keep changes minimal");
          expect(context.remainingInspectionBudget).toBe(1);
          expect(context.repository).not.toHaveProperty("repositoryRoot");
          return { type: "complete", task };
        });
      const result = await planTask({
        goal: { ...goal, objective },
        repositoryPath: root,
        limits,
        planner,
      });
      expect(result.status).toBe("completed");
      expect(result.rounds).toBe(1);
    }
  );

  it("does not pre-inspect unmentioned files", async () => {
    const root = createRepository();
    writeFileSync(join(root, "README.md"), "Readme");
    const planner = vi
      .fn<Planner>()
      .mockResolvedValue({ type: "complete", task });
    await planTask({ goal, repositoryPath: root, limits, planner });
    expect(planner.mock.calls[0][0].inspectedFiles).toEqual([]);
  });

  it("does not match repository-external traversal or partial filenames", async () => {
    const root = createRepository();
    writeFileSync(join(root, "README.md"), "Readme");
    const planner = vi
      .fn<Planner>()
      .mockResolvedValue({ type: "complete", task });
    await planTask({
      goal: { ...goal, objective: "../README.md NOTREADME.md /etc/passwd" },
      repositoryPath: root,
      limits,
      planner,
    });
    expect(planner.mock.calls[0][0].inspectedFiles).toEqual([]);
  });

  it("skips oversized files and ambiguous basenames", async () => {
    const root = createRepository();
    writeFileSync(join(root, "README.md"), "x".repeat(64 * 1024 + 1));
    mkdirSync(join(root, "nested"));
    writeFileSync(join(root, "nested", "example.ts"), "Ambiguous");
    const planner = vi
      .fn<Planner>()
      .mockResolvedValue({ type: "complete", task });
    await planTask({
      goal: { ...goal, objective: "README example.ts" },
      repositoryPath: root,
      limits,
      planner,
    });
    expect(planner.mock.calls[0][0].inspectedFiles).toEqual([]);
  });

  it("counts initial inspection against the existing total budget and retains fail-fast enforcement", async () => {
    const root = createRepository();
    writeFileSync(join(root, "README.md"), "Readme");
    const planner = vi.fn<Planner>().mockResolvedValue({
      type: "inspect",
      request: { paths: ["example.ts"] },
    });
    const result = await planTask({
      goal: { ...goal, objective: "README" },
      repositoryPath: root,
      limits: { ...limits, maxTotalFiles: 1 },
      planner,
    });
    expect(result).toMatchObject({
      status: "failed",
      rounds: 1,
      reason: "Inspection request exceeds maxTotalFiles.",
    });
  });

  it("skips optional seeding when exact matches exceed the initial request budget", async () => {
    const root = createRepository();
    const planner = vi
      .fn<Planner>()
      .mockResolvedValue({ type: "complete", task });
    await planTask({
      goal: { ...goal, objective: "example.ts package.json" },
      repositoryPath: root,
      limits: { ...limits, maxFilesPerRequest: 1 },
      planner,
    });
    expect(planner.mock.calls[0][0].inspectedFiles).toEqual([]);
  });
  it("generates fresh Harness identifiers per planning invocation and preserves Human governance", async () => {
    const root = createRepository();
    const planner = vi.fn<Planner>().mockResolvedValue({
      type: "complete",
      task: {
        ...task,
        targetRepository: "ai-other",
        constraints: [],
      },
    });
    const first = await planTask({
      goal,
      repositoryPath: root,
      limits,
      planner,
    });
    const second = await planTask({
      goal,
      repositoryPath: root,
      limits,
      planner,
    });
    expect(first.status).toBe("completed");
    expect(second.status).toBe("completed");
    if (first.status === "completed" && second.status === "completed") {
      expect(first.task.id).toMatch(/^task-[0-9a-f-]{36}$/);
      expect(first.task.goalId).toMatch(/^goal-[0-9a-f-]{36}$/);
      expect(first.task.id).not.toBe(second.task.id);
      expect(first.task.goalId).not.toBe(second.task.goalId);
      expect(first.task.constraints).toEqual(goal.constraints);
      expect(first.task.targetRepository).toBe(goal.targetRepository);
    }
  });
  it("resolves the repository and passes its overview and unchanged goal to the injected planner", async () => {
    const root = createRepository();
    const repositoryPath = relative(process.cwd(), root);
    const resolvedRoot = resolve(repositoryPath);
    const before = structuredClone(goal);
    const planner = vi
      .fn<Planner>()
      .mockResolvedValue({ type: "complete", task });
    const createPlanner = vi.spyOn(codex, "createCodexPlanner");

    const result = await planTask({ goal, repositoryPath, limits, planner });

    expect(planner).toHaveBeenCalledOnce();
    const initialState = planner.mock.calls[0][0];
    expect(initialState).toEqual({
      goal,
      repository: inspectRepository(resolvedRoot),
      inspectedFiles: [],
    });
    expect(initialState.goal).toBe(goal);
    expect(initialState.repository.repositoryRoot).toBe(resolvedRoot);
    expect(initialState.repository.repositoryName).toBe(basename(resolvedRoot));
    expect(initialState.repository.packageScripts).toEqual({
      test: "vitest run",
    });
    expect(initialState.repository.instructions).toBe("Keep changes minimal");
    expect(result).toEqual({
      status: "completed",
      task: {
        ...task,
        id: expect.stringMatching(/^task-[0-9a-f-]{36}$/),
        goalId: expect.stringMatching(/^goal-[0-9a-f-]{36}$/),
      },
      state: initialState,
      rounds: 1,
    });
    expect(goal).toEqual(before);
    expect(createPlanner).not.toHaveBeenCalled();
  });

  it("connects real inspection and planning loop for inspect then complete", async () => {
    const root = createRepository();
    const before = structuredClone(goal);
    const planner = vi
      .fn<Planner>()
      .mockResolvedValueOnce({
        type: "inspect",
        request: { paths: ["example.ts"] },
      })
      .mockResolvedValueOnce({ type: "complete", task });

    const result = await planTask({
      goal,
      repositoryPath: root,
      limits,
      planner,
    });

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
    await expect(
      planTask({ goal, repositoryPath: join(root, "missing"), limits, planner })
    ).rejects.toThrow("Repository path does not exist");
    mkdirSync(join(root, "not-a-repository"));
    await expect(
      planTask({
        goal,
        repositoryPath: join(root, "not-a-repository"),
        limits,
        planner,
      })
    ).rejects.toThrow("Path is not a Git repository");
    expect(planner).not.toHaveBeenCalled();
  });

  it("uses the default Codex planner factory without invoking the real CLI in tests", async () => {
    const planner = vi
      .fn<Planner>()
      .mockResolvedValue({ type: "complete", task });
    const createPlanner = vi
      .spyOn(codex, "createCodexPlanner")
      .mockReturnValue(planner);
    const result = await planTask({
      goal,
      repositoryPath: createRepository(),
      limits,
    });
    expect(createPlanner).toHaveBeenCalledOnce();
    expect(planner).toHaveBeenCalledOnce();
    expect(result.status).toBe("completed");
  });

  it("passes workflow failures from the loop through unchanged", async () => {
    const planner = vi
      .fn<Planner>()
      .mockResolvedValue({ type: "inspect", request: { paths: [] } });
    const result = await planTask({
      goal,
      repositoryPath: createRepository(),
      limits,
      planner,
    });
    expect(result).toMatchObject({
      status: "failed",
      rounds: 1,
      reason: "No new inspection context requested.",
    });
    expect(result.state).toBe(planner.mock.calls[0][0]);
  });
});
