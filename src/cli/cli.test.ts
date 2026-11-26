import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

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
vi.mock("./commands/decision/index.js", () => ({
  runDecisionCommand: vi.fn(),
}));
vi.mock("./presenters/decision/index.js", () => ({
  presentDecisions: vi.fn(),
  presentComparison: vi.fn(),
}));

vi.mock("./prompts/decision/index.js", () => ({ askDecision: vi.fn() }));
beforeEach(() => {
  vi.resetAllMocks();
  vi.mocked(runDecisionCommand).mockResolvedValue({
    goal: { objective: "Review UI", targetRepository: "example" },
    snapshot: { repositoryRoot: "/repositories/example", commitSha: "abc123" },
    decisions: [],
    comparison: { findings: [], gaps: [] },
  });
  vi.spyOn(console, "log").mockImplementation(() => {});
  vi.spyOn(console, "error").mockImplementation(() => {});
});
afterEach(() => {
  vi.restoreAllMocks();
});

it("routes explicit staffing independently of the v0-v3 selector", async () => {
  vi.mocked(runStaffingCli).mockResolvedValue(0);
  expect(await runCli(["staffing", "/repo", "goal.json"])).toBe(0);
  expect(runStaffingCli).toHaveBeenCalledWith(["/repo", "goal.json"]);
});

describe("CLI approval boundary", () => {
  it("routes explicit governance commands without Planning, Worker execution or Task Approval", async () => {
    vi.mocked(runGovernanceCli).mockResolvedValue(0);
    expect(await runCli(["governance", "approve", "proposal.json"])).toBe(0);
    expect(runGovernanceCli).toHaveBeenCalledWith(["approve", "proposal.json"]);
  });
  it("routes decision independently of Planning, Approval and Execution", async () => {
    const snapshot = {
      repositoryRoot: "/repositories/example",
      commitSha: "abc123",
    };
    vi.mocked(runDecisionCommand).mockResolvedValue({
      goal: { objective: "Review UI", targetRepository: "example" },
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
});

describe("interactive Decision routing", () => {
  it("routes Decision input directly to the shared Decision flow", async () => {
    const input = {
      repositoryPath: ".",
      objective: "Review UI",
      filePaths: ["foo.ts", "bar.ts"],
    };
    vi.mocked(askDecision).mockResolvedValue(input);
    expect(await runCli([])).toBe(0);
    expect(askDecision).toHaveBeenCalledOnce();
    expect(vi.mocked(runDecisionCommand).mock.calls[0][0]).toBe(input);
    expect(presentDecisions).toHaveBeenCalledOnce();
    expect(presentComparison).toHaveBeenCalledOnce();
  });

  it.each([
    ["decision", ".", "Review UI", "foo.ts"],
    ["execute", "task.json", "."],
    [".", "Plan and execute"],
  ])("never selects a workflow for explicit arguments: %j", async (...args) => {
    expect([0, 1]).toContain(await runCli(args));
    expect(askDecision).not.toHaveBeenCalled();
  });

  it("reports Decision input EOF without invoking the application", async () => {
    vi.mocked(askDecision).mockRejectedValue(new Error("Decision input ended"));
    expect(await runCli([])).toBe(1);
    expect(runDecisionCommand).not.toHaveBeenCalled();
    expect(console.error).toHaveBeenCalledWith("Error: Decision input ended");
  });
});
it.each([
  ["execute", "task.json", "."],
  [".", "Old positional syntax"],
  ["plan", ".", "Clarify README"],
])("rejects retired commands and positional arguments %j", async (...args) => {
  expect(await runCli(args)).toBe(1);
  expect(askDecision).not.toHaveBeenCalled();
  expect(runDecisionCommand).not.toHaveBeenCalled();
  expect(console.error).toHaveBeenCalledWith(
    expect.stringContaining("approved Phase B Assignment")
  );
});
