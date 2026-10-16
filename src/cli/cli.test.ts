import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { planTask, type PlanningState } from "@/application/planning/index.js";
import { executeTask } from "@/application/execution/index.js";
import { resolveRepositoryRoot } from "@/infrastructure/git/index.js";
import type { TaskContract } from "@/contracts/task.js";
import { approveTask } from "./prompts/approve-task.js";
import { askGoal } from "./prompts/ask-goal.js";
import { runCli } from "./cli.js";
import { selectWorkflow } from "./prompts/select-workflow.js";
import { askDecision } from "./prompts/ask-decision.js";
import { askExecution } from "./prompts/ask-execution.js";
import { runExecutionCli } from "./commands/execute/execute.js";
import { runDecisionCommand } from "./commands/decision/decision.js";
import { presentDecisions } from "./presenters/decisions.js";
import { presentComparison } from "./presenters/comparison.js";

vi.mock("@/application/planning/index.js", () => ({ planTask: vi.fn() }));
vi.mock("@/application/execution/index.js", () => ({ executeTask: vi.fn() }));
vi.mock("@/infrastructure/git/index.js", () => ({ resolveRepositoryRoot: vi.fn() }));
vi.mock("./prompts/approve-task.js", () => ({ approveTask: vi.fn() }));
vi.mock("./prompts/ask-goal.js", () => ({ askGoal: vi.fn() }));
vi.mock("./commands/decision/decision.js", () => ({ runDecisionCommand: vi.fn() }));
vi.mock("./presenters/decisions.js", () => ({ presentDecisions: vi.fn() }));
vi.mock("./presenters/comparison.js", () => ({ presentComparison: vi.fn() }));

vi.mock("./prompts/select-workflow.js", () => ({ selectWorkflow: vi.fn() }));
vi.mock("./prompts/ask-decision.js", () => ({ askDecision: vi.fn() }));
vi.mock("./prompts/ask-execution.js", () => ({ askExecution: vi.fn() }));
vi.mock("./commands/execute/execute.js", async () => ({
  ...await vi.importActual<typeof import("./commands/execute/execute.js")>("./commands/execute/execute.js"),
  runExecutionCli: vi.fn(),
}));

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
  vi.mocked(selectWorkflow).mockResolvedValue("plan-execute");
  vi.mocked(runExecutionCli).mockResolvedValue(0);
  vi.mocked(runDecisionCommand).mockResolvedValue({ goal: state.goal, snapshot: { repositoryRoot: "/repositories/example", commitSha: "abc123" }, decisions: [], comparison: { findings: [], gaps: [] } });
  vi.spyOn(console, "log").mockImplementation(() => {});
  vi.spyOn(console, "error").mockImplementation(() => {});
  vi.mocked(planTask).mockResolvedValue({ status: "completed", task, state, rounds: 2 });
  vi.mocked(executeTask).mockResolvedValue({ passed: true, evidence: {}, failures: [] });
  vi.mocked(resolveRepositoryRoot).mockReturnValue(state.repository.repositoryRoot);
});
afterEach(() => { vi.restoreAllMocks(); });

describe("CLI approval boundary", () => {
  it("routes decision independently of Planning, Approval and Execution", async () => {
    const snapshot = { repositoryRoot: "/repositories/example", commitSha: "abc123" };
    vi.mocked(runDecisionCommand).mockResolvedValue({ goal: state.goal, snapshot, decisions: [], comparison: { findings: [], gaps: [] } });
    expect(await runCli(["decision", "/repositories/example", "Review UI", "src/button.tsx", "README.md"])).toBe(0);
    expect(runDecisionCommand).toHaveBeenCalledWith({
      repositoryPath: "/repositories/example", objective: "Review UI", filePaths: ["src/button.tsx", "README.md"],
    });
    expect(presentDecisions).toHaveBeenCalledWith(snapshot, []);
    expect(presentComparison).toHaveBeenCalledWith({ findings: [], gaps: [] });
    expect(vi.mocked(presentDecisions).mock.invocationCallOrder[0]).toBeLessThan(vi.mocked(presentComparison).mock.invocationCallOrder[0]);
    expect(console.log).toHaveBeenCalledWith("Decision...");
    expect(console.log).toHaveBeenCalledWith(expect.stringMatching(/^Decision Duration: \d+\.\ds$/));
    expect(planTask).not.toHaveBeenCalled();
    expect(executeTask).not.toHaveBeenCalled();
    expect(approveTask).not.toHaveBeenCalled();
    expect(askGoal).not.toHaveBeenCalled();
  });

  it.each(["Evidence validation failed", "Comparison reference validation failed"])("reports command failure without partial presentation: %s", async (message) => {
    vi.mocked(runDecisionCommand).mockRejectedValue(new Error(message));
    expect(await runCli(["decision", ".", "Review UI", "README.md"])).toBe(1);
    expect(console.error).toHaveBeenCalledWith(`Error: ${message}`);
    expect(presentDecisions).not.toHaveBeenCalled();
    expect(presentComparison).not.toHaveBeenCalled();
    expect(planTask).not.toHaveBeenCalled();
    expect(executeTask).not.toHaveBeenCalled();
  });

  it("passes missing decision arguments to command validation", async () => {
    vi.mocked(runDecisionCommand).mockRejectedValue(new Error("Repository path is required."));
    expect(await runCli(["decision"])).toBe(1);
    expect(runDecisionCommand).toHaveBeenCalledWith({ repositoryPath: "", objective: "", filePaths: [] });
    expect(console.error).toHaveBeenCalledWith("Error: Repository path is required.");
  });
  it("passes only inspected files matching allowed paths into Execution", async () => {
    const inspectedFiles = [{ path: "README.md", content: "Existing introduction" }, { path: "package.json", content: "{}" }];
    vi.mocked(planTask).mockResolvedValue({ status: "completed", task, state: { ...state, inspectedFiles }, rounds: 1 });
    vi.mocked(approveTask).mockResolvedValue(true);
    expect(await runCli([".", "Clarify README"])).toBe(0);
    expect(executeTask).toHaveBeenCalledWith(task, state.repository.repositoryRoot, {
      workerContext: { inspectedFiles: [inspectedFiles[0]] },
    });
    expect(task).not.toHaveProperty("inspectedFiles");
  });
  it("shows planning, Human wait, execution stages and end-to-end total", async () => {
    vi.mocked(approveTask).mockResolvedValue(true);
    vi.mocked(executeTask).mockResolvedValue({ passed: true, evidence: {}, failures: [],
      telemetry: { workspaceDurationMs: 800, workerDurationMs: 42700,
        verificationDurationMs: 11300, cleanupDurationMs: 400, totalDurationMs: 55200 } });
    expect(await runCli([".", "Clarify README"])).toBe(0);
    expect(console.log).toHaveBeenCalledWith("Worker: 42.7s");
    expect(console.log).toHaveBeenCalledWith(expect.stringMatching(/^Approval Wait: \d+\.\ds$/));
    expect(console.log).toHaveBeenCalledWith(expect.stringMatching(/^Total: \d+\.\ds$/));
  });
  it("asks for Goal input when arguments are absent", async () => {
    vi.mocked(askGoal).mockResolvedValue({ repositoryPath: ".", objective: "Interactive goal" });
    vi.mocked(approveTask).mockResolvedValue(true);
    expect(await runCli([])).toBe(0);
    expect(askGoal).toHaveBeenCalledOnce();
    expect(selectWorkflow).toHaveBeenCalledOnce();
    expect(runDecisionCommand).not.toHaveBeenCalled();
    expect(runExecutionCli).not.toHaveBeenCalled();
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
    expect(executeTask).toHaveBeenCalledWith(task, state.repository.repositoryRoot, { workerContext: { inspectedFiles: [] } });
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


describe("interactive workflow routing", () => {
  it("routes Plan only through askGoal without Approval or Execution", async () => {
    vi.mocked(selectWorkflow).mockResolvedValue("plan");
    vi.mocked(askGoal).mockResolvedValue({ repositoryPath: ".", objective: "Plan the change" });
    expect(await runCli([])).toBe(0);
    expect(selectWorkflow).toHaveBeenCalledOnce();
    expect(askGoal).toHaveBeenCalledOnce();
    expect(planTask).toHaveBeenCalledWith(expect.objectContaining({ goal: expect.objectContaining({ objective: "Plan the change" }) }));
    expect(approveTask).not.toHaveBeenCalled();
    expect(executeTask).not.toHaveBeenCalled();
    expect(runDecisionCommand).not.toHaveBeenCalled();
    expect(runExecutionCli).not.toHaveBeenCalled();
  });

  it("routes Decision input directly to the shared Decision flow", async () => {
    const input = { repositoryPath: ".", objective: "Review UI", filePaths: ["foo.ts", "bar.ts"] };
    vi.mocked(selectWorkflow).mockResolvedValue("decision");
    vi.mocked(askDecision).mockResolvedValue(input);
    expect(await runCli([])).toBe(0);
    expect(askDecision).toHaveBeenCalledOnce();
    expect(vi.mocked(runDecisionCommand).mock.calls[0][0]).toBe(input);
    expect(presentDecisions).toHaveBeenCalledOnce();
    expect(presentComparison).toHaveBeenCalledOnce();
    expect(askGoal).not.toHaveBeenCalled();
    expect(planTask).not.toHaveBeenCalled();
    expect(approveTask).not.toHaveBeenCalled();
    expect(executeTask).not.toHaveBeenCalled();
    expect(runExecutionCli).not.toHaveBeenCalled();
  });

  it("routes Execute existing task with the original task/repository argument order", async () => {
    vi.mocked(selectWorkflow).mockResolvedValue("execute");
    vi.mocked(askExecution).mockResolvedValue({ taskPath: "task.json", repositoryPath: "." });
    expect(await runCli([])).toBe(0);
    expect(askExecution).toHaveBeenCalledOnce();
    expect(runExecutionCli).toHaveBeenCalledWith(["task.json", "."]);
    expect(askGoal).not.toHaveBeenCalled();
    expect(planTask).not.toHaveBeenCalled();
    expect(approveTask).not.toHaveBeenCalled();
    expect(executeTask).not.toHaveBeenCalled();
    expect(runDecisionCommand).not.toHaveBeenCalled();
  });

  it.each([
    ["plan", ".", "Plan the change"],
    ["decision", ".", "Review UI", "foo.ts"],
    ["execute", "task.json", "."],
    [".", "Plan and execute"],
  ])("never selects a workflow for explicit arguments: %j", async (...args) => {
    expect([0, 1]).toContain(await runCli(args));
    expect(selectWorkflow).not.toHaveBeenCalled();
    expect(askGoal).not.toHaveBeenCalled();
    expect(askDecision).not.toHaveBeenCalled();
    expect(askExecution).not.toHaveBeenCalled();
  });

  it("reports selector EOF without entering another workflow", async () => {
    vi.mocked(selectWorkflow).mockRejectedValue(new Error("Workflow input ended"));
    expect(await runCli([])).toBe(1);
    expect(console.error).toHaveBeenCalledWith("Error: Workflow input ended");
    expect(askGoal).not.toHaveBeenCalled();
    expect(planTask).not.toHaveBeenCalled();
    expect(runDecisionCommand).not.toHaveBeenCalled();
    expect(runExecutionCli).not.toHaveBeenCalled();
  });

  it("reports Decision input EOF without invoking the application", async () => {
    vi.mocked(selectWorkflow).mockResolvedValue("decision");
    vi.mocked(askDecision).mockRejectedValue(new Error("Decision input ended"));
    expect(await runCli([])).toBe(1);
    expect(runDecisionCommand).not.toHaveBeenCalled();
    expect(console.error).toHaveBeenCalledWith("Error: Decision input ended");
  });
});
