import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { planTask, type PlanningState } from "@/application/planning/index.js";
import { executeTask } from "@/application/execution/index.js";
import { resolveRepositoryRoot } from "@/infrastructure/git/index.js";
import type { TaskContract } from "@/contracts/task.js";
import { approveTask } from "./prompts/approve-task.js";
import { askGoal } from "./prompts/ask-goal.js";
import { runCli } from "./cli.js";

vi.mock("@/application/planning/index.js", () => ({ planTask: vi.fn() }));
vi.mock("@/application/execution/index.js", () => ({ executeTask: vi.fn() }));
vi.mock("@/infrastructure/git/index.js", () => ({ resolveRepositoryRoot: vi.fn() }));
vi.mock("./prompts/approve-task.js", () => ({ approveTask: vi.fn() }));
vi.mock("./prompts/ask-goal.js", () => ({ askGoal: vi.fn() }));

const task: TaskContract = {
  id: "task-human", goalId: "goal-human", objective: "Clarify README",
  targetRepository: "example", allowedPaths: ["README.md"], forbiddenPaths: [],
  constraints: [], acceptanceCriteria: ["Clear introduction"], verification: [],
};
const state: PlanningState = {
  goal: { objective: task.objective, targetRepository: "example" },
  repository: { repositoryRoot: "/repositories/example", repositoryName: "example", fileTree: [], packageScripts: {} },
  inspectedFiles: [],
};

beforeEach(() => {
  vi.resetAllMocks();
  vi.spyOn(console, "log").mockImplementation(() => {});
  vi.spyOn(console, "error").mockImplementation(() => {});
  vi.mocked(planTask).mockResolvedValue({ status: "completed", task, state, rounds: 2 });
  vi.mocked(executeTask).mockResolvedValue({ passed: true, evidence: {}, failures: [] });
  vi.mocked(resolveRepositoryRoot).mockReturnValue(state.repository.repositoryRoot);
});
afterEach(() => { vi.restoreAllMocks(); });

describe("CLI approval boundary", () => {
  it("asks for Goal input when arguments are absent", async () => {
    vi.mocked(askGoal).mockResolvedValue({ repositoryPath: ".", objective: "Interactive goal" });
    vi.mocked(approveTask).mockResolvedValue(true);
    expect(await runCli([])).toBe(0);
    expect(askGoal).toHaveBeenCalledOnce();
    expect(planTask).toHaveBeenCalledWith(expect.objectContaining({ goal: expect.objectContaining({ objective: "Interactive goal" }) }));
    expect(vi.mocked(executeTask).mock.calls[0][0]).toBe(task);
  });

  it("does not plan or execute when interactive input ends early", async () => {
    vi.mocked(askGoal).mockRejectedValue(new Error("Input ended"));
    expect(await runCli([])).toBe(1);
    expect(planTask).not.toHaveBeenCalled();
    expect(approveTask).not.toHaveBeenCalled();
    expect(executeTask).not.toHaveBeenCalled();
  });
  it("passes the generated task directly to execution only after approval resolves", async () => {
    let approve!: (answer: boolean) => void;
    vi.mocked(approveTask).mockImplementation(() => new Promise((resolve) => { approve = resolve; }));
    const pending = runCli([".", "Clarify README"]);
    await vi.waitFor(() => expect(approveTask).toHaveBeenCalledWith());
    expect(executeTask).not.toHaveBeenCalled();
    expect(console.log).toHaveBeenCalledWith(JSON.stringify(task, null, 2));
    expect(askGoal).not.toHaveBeenCalled();
    approve(true);
    expect(await pending).toBe(0);
    expect(executeTask).toHaveBeenCalledWith(task, state.repository.repositoryRoot, {});
    expect(vi.mocked(executeTask).mock.calls[0][0]).toBe(task);
  });

  it("does not execute after rejection", async () => {
    vi.mocked(approveTask).mockResolvedValue(false);
    expect(await runCli([".", "Clarify README"])).toBe(1);
    expect(executeTask).not.toHaveBeenCalled();
  });

  it("does not ask for approval or execute after planning failure", async () => {
    vi.mocked(planTask).mockResolvedValue({ status: "failed", state, rounds: 4, reason: "Round limit" });
    expect(await runCli([".", "Clarify README"])).toBe(1);
    expect(approveTask).not.toHaveBeenCalled();
    expect(executeTask).not.toHaveBeenCalled();
  });

  it("propagates integration failure as a non-zero CLI result", async () => {
    vi.mocked(planTask).mockRejectedValue(new Error("Planner failed"));
    expect(await runCli([".", "Clarify README"])).toBe(1);
    expect(executeTask).not.toHaveBeenCalled();
  });

  it("keeps the plan-only command from asking approval or executing", async () => {
    expect(await runCli(["plan", ".", "Clarify README"])).toBe(0);
    expect(approveTask).not.toHaveBeenCalled();
    expect(executeTask).not.toHaveBeenCalled();
  });
});
