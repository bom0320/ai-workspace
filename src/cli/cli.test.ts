import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  planTask,
  type PlanningState,
} from "@/application/specialist/task-detailing/index.js";
import { resolveRepositoryRoot } from "@/infrastructure/git/index.js";
import type { TaskContract } from "@/contracts/task.js";

import { selectWorkflow } from "./prompts/workflow/index.js";
import { askGoal } from "./prompts/planning/index.js";
import { runGovernanceCli } from "./commands/governance/index.js";
import { runCli } from "./cli.js";
import { runStaffingCli } from "./commands/staffing/index.js";
import { askDecision } from "./prompts/decision/index.js";
import { runDecisionCommand } from "./commands/decision/index.js";
import {
  presentDecisions,
  presentComparison,
} from "./presenters/decision/index.js";

vi.mock("./commands/staffing/index.js", () => ({ runStaffingCli: vi.fn() }));
vi.mock("./commands/governance/index.js", () => ({
  runGovernanceCli: vi.fn(),
}));
vi.mock("@/application/specialist/task-detailing/index.js", () => ({
  planTask: vi.fn(),
}));
vi.mock("@/infrastructure/git/index.js", () => ({
  resolveRepositoryRoot: vi.fn(),
}));
vi.mock("./prompts/workflow/index.js", () => ({
  selectWorkflow: vi.fn(),
}));
vi.mock("./prompts/planning/index.js", () => ({ askGoal: vi.fn() }));
vi.mock("./commands/decision/index.js", () => ({
  runDecisionCommand: vi.fn(),
}));
vi.mock("./presenters/decision/index.js", () => ({
  presentDecisions: vi.fn(),
  presentComparison: vi.fn(),
}));

vi.mock("./prompts/decision/index.js", () => ({ askDecision: vi.fn() }));
const task: TaskContract = {
  id: "task-human",
  goalId: "goal-human",
  objective: "Clarify README",
  targetRepository: "example",
  allowedPaths: ["README.md"],
  forbiddenPaths: [],
  constraints: [],
  acceptanceCriteria: ["Clear introduction"],
  verification: [],
};
const state: PlanningState = {
  goal: { objective: task.objective, targetRepository: "example" },
  repository: {
    repositoryRoot: "/repositories/example",
    repositoryName: "example",
    fileTree: [],
    packageScripts: {},
  },
  inspectedFiles: [],
};

beforeEach(() => {
  vi.resetAllMocks();
  vi.mocked(selectWorkflow).mockResolvedValue("plan");
  vi.mocked(runDecisionCommand).mockResolvedValue({
    goal: state.goal,
    snapshot: { repositoryRoot: "/repositories/example", commitSha: "abc123" },
    decisions: [],
    comparison: { findings: [], gaps: [] },
  });
  vi.spyOn(console, "log").mockImplementation(() => {});
  vi.spyOn(console, "error").mockImplementation(() => {});
  vi.mocked(planTask).mockResolvedValue({
    status: "completed",
    task,
    state,
    rounds: 2,
  });
  vi.mocked(resolveRepositoryRoot).mockReturnValue(
    state.repository.repositoryRoot
  );
});
afterEach(() => {
  vi.restoreAllMocks();
});

it("routes explicit staffing independently of the v0-v3 selector", async () => {
  vi.mocked(runStaffingCli).mockResolvedValue(0);
  expect(await runCli(["staffing", "/repo", "goal.json"])).toBe(0);
  expect(runStaffingCli).toHaveBeenCalledWith(["/repo", "goal.json"]);
  expect(selectWorkflow).not.toHaveBeenCalled();
  expect(planTask).not.toHaveBeenCalled();
});

describe("CLI approval boundary", () => {
  it("routes explicit governance commands without Planning, Worker execution or Task Approval", async () => {
    vi.mocked(runGovernanceCli).mockResolvedValue(0);
    expect(await runCli(["governance", "approve", "proposal.json"])).toBe(0);
    expect(runGovernanceCli).toHaveBeenCalledWith(["approve", "proposal.json"]);
    expect(planTask).not.toHaveBeenCalled();
    expect(selectWorkflow).not.toHaveBeenCalled();
  });
  it("routes decision independently of Planning, Approval and Execution", async () => {
    const snapshot = {
      repositoryRoot: "/repositories/example",
      commitSha: "abc123",
    };
    vi.mocked(runDecisionCommand).mockResolvedValue({
      goal: state.goal,
      snapshot,
      decisions: [],
      comparison: { findings: [], gaps: [] },
    });
    expect(
      await runCli([
        "decision",
        "/repositories/example",
        "Review UI",
        "src/button.tsx",
        "README.md",
      ])
    ).toBe(0);
    expect(runDecisionCommand).toHaveBeenCalledWith({
      repositoryPath: "/repositories/example",
      objective: "Review UI",
      filePaths: ["src/button.tsx", "README.md"],
    });
    expect(presentDecisions).toHaveBeenCalledWith(snapshot, []);
    expect(presentComparison).toHaveBeenCalledWith({ findings: [], gaps: [] });
    expect(
      vi.mocked(presentDecisions).mock.invocationCallOrder[0]
    ).toBeLessThan(vi.mocked(presentComparison).mock.invocationCallOrder[0]);
    expect(console.log).toHaveBeenCalledWith("Decision...");
    expect(console.log).toHaveBeenCalledWith(
      expect.stringMatching(/^Decision Duration: \d+\.\ds$/)
    );
    expect(planTask).not.toHaveBeenCalled();
    expect(askGoal).not.toHaveBeenCalled();
  });

  it.each([
    "Evidence validation failed",
    "Comparison reference validation failed",
  ])(
    "reports command failure without partial presentation: %s",
    async (message) => {
      vi.mocked(runDecisionCommand).mockRejectedValue(new Error(message));
      expect(await runCli(["decision", ".", "Review UI", "README.md"])).toBe(1);
      expect(console.error).toHaveBeenCalledWith(`Error: ${message}`);
      expect(presentDecisions).not.toHaveBeenCalled();
      expect(presentComparison).not.toHaveBeenCalled();
      expect(planTask).not.toHaveBeenCalled();
    }
  );

  it("passes missing decision arguments to command validation", async () => {
    vi.mocked(runDecisionCommand).mockRejectedValue(
      new Error("Repository path is required.")
    );
    expect(await runCli(["decision"])).toBe(1);
    expect(runDecisionCommand).toHaveBeenCalledWith({
      repositoryPath: "",
      objective: "",
      filePaths: [],
    });
    expect(console.error).toHaveBeenCalledWith(
      "Error: Repository path is required."
    );
  });
  it("keeps the plan-only command from asking approval or executing", async () => {
    expect(await runCli(["plan", ".", "Clarify README"])).toBe(0);
  });
});

describe("interactive workflow routing", () => {
  it("routes Plan only through askGoal without Approval or Execution", async () => {
    vi.mocked(selectWorkflow).mockResolvedValue("plan");
    vi.mocked(askGoal).mockResolvedValue({
      repositoryPath: ".",
      objective: "Plan the change",
    });
    expect(await runCli([])).toBe(0);
    expect(selectWorkflow).toHaveBeenCalledOnce();
    expect(askGoal).toHaveBeenCalledOnce();
    expect(planTask).toHaveBeenCalledWith(
      expect.objectContaining({
        goal: expect.objectContaining({ objective: "Plan the change" }),
      })
    );
    expect(runDecisionCommand).not.toHaveBeenCalled();
  });

  it("routes Decision input directly to the shared Decision flow", async () => {
    const input = {
      repositoryPath: ".",
      objective: "Review UI",
      filePaths: ["foo.ts", "bar.ts"],
    };
    vi.mocked(selectWorkflow).mockResolvedValue("decision");
    vi.mocked(askDecision).mockResolvedValue(input);
    expect(await runCli([])).toBe(0);
    expect(askDecision).toHaveBeenCalledOnce();
    expect(vi.mocked(runDecisionCommand).mock.calls[0][0]).toBe(input);
    expect(presentDecisions).toHaveBeenCalledOnce();
    expect(presentComparison).toHaveBeenCalledOnce();
    expect(askGoal).not.toHaveBeenCalled();
    expect(planTask).not.toHaveBeenCalled();
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
  });

  it("reports selector EOF without entering another workflow", async () => {
    vi.mocked(selectWorkflow).mockRejectedValue(
      new Error("Workflow input ended")
    );
    expect(await runCli([])).toBe(1);
    expect(console.error).toHaveBeenCalledWith("Error: Workflow input ended");
    expect(askGoal).not.toHaveBeenCalled();
    expect(planTask).not.toHaveBeenCalled();
    expect(runDecisionCommand).not.toHaveBeenCalled();
  });

  it("reports Decision input EOF without invoking the application", async () => {
    vi.mocked(selectWorkflow).mockResolvedValue("decision");
    vi.mocked(askDecision).mockRejectedValue(new Error("Decision input ended"));
    expect(await runCli([])).toBe(1);
    expect(runDecisionCommand).not.toHaveBeenCalled();
    expect(console.error).toHaveBeenCalledWith("Error: Decision input ended");
  });
});
it.each([
  ["execute", "task.json", "."],
  [".", "Old positional syntax"],
])("rejects retired execution arguments %j", async (...args) => {
  expect(await runCli(args)).toBe(1);
  expect(console.error).toHaveBeenCalledWith(
    expect.stringContaining("approved Phase B Work Item")
  );
  expect(planTask).not.toHaveBeenCalled();
  expect(selectWorkflow).not.toHaveBeenCalled();
});
