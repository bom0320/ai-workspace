import { beforeEach, describe, expect, it, vi } from "vitest";

import { runDecision, type RunDecisionResult } from "@/application/decision/index.js";
import { compareDecisions, type ComparisonResult } from "@/application/comparison/index.js";
import { runDecisionCommand } from "./decision.js";

vi.mock("@/application/decision/index.js", () => ({ runDecision: vi.fn() }));
vi.mock("@/application/comparison/index.js", () => ({ compareDecisions: vi.fn() }));

const input = { repositoryPath: "/repositories/example", objective: "Evaluate the interface", filePaths: ["src/button.tsx"] };
const decisionResult: RunDecisionResult = {
  goal: { objective: "Actual Specialist Goal", targetRepository: "example" },
  snapshot: { repositoryRoot: input.repositoryPath, commitSha: "abc123" },
  decisions: ["frontend", "ux"].map((specialistId) => ({
    specialistId, recommendation: "Inspect interaction", evidence: [], risks: [], uncertainty: [],
  })),
};
const comparison: ComparisonResult = { findings: [], gaps: [] };

beforeEach(() => {
  vi.resetAllMocks();
  vi.mocked(runDecision).mockResolvedValue(decisionResult);
  vi.mocked(compareDecisions).mockResolvedValue(comparison);
});

describe("runDecisionCommand", () => {
  it("waits for Decision and passes original provenance to Comparison", async () => {
    let finish!: (result: RunDecisionResult) => void;
    vi.mocked(runDecision).mockImplementationOnce(() => new Promise((resolve) => { finish = resolve; }));
    const pending = runDecisionCommand(input);
    expect(vi.mocked(runDecision).mock.calls[0][0]).toBe(input);
    expect(compareDecisions).not.toHaveBeenCalled();
    finish(decisionResult);

    const result = await pending;
    expect(runDecision).toHaveBeenCalledOnce();
    expect(compareDecisions).toHaveBeenCalledExactlyOnceWith({
      goal: decisionResult.goal,
      repositoryCommitSha: decisionResult.snapshot.commitSha,
      decisions: decisionResult.decisions,
    });
    const [context] = vi.mocked(compareDecisions).mock.calls[0];
    expect(context.goal).toBe(decisionResult.goal);
    expect(context.decisions).toBe(decisionResult.decisions);
    expect(result).toEqual({ ...decisionResult, comparison });
    expect(result.goal).toBe(decisionResult.goal);
    expect(result.snapshot).toBe(decisionResult.snapshot);
    expect(result.decisions).toBe(decisionResult.decisions);
    expect(result.comparison).toBe(comparison);
  });

  it("propagates Decision errors without calling Comparison", async () => {
    const error = new Error("Snapshot failure");
    vi.mocked(runDecision).mockRejectedValue(error);
    await expect(runDecisionCommand(input)).rejects.toBe(error);
    expect(compareDecisions).not.toHaveBeenCalled();
  });

  it("propagates Comparison errors without partial success or retry", async () => {
    const error = new Error("Reference validation failure");
    vi.mocked(compareDecisions).mockRejectedValue(error);
    await expect(runDecisionCommand(input)).rejects.toBe(error);
    expect(runDecision).toHaveBeenCalledOnce();
    expect(compareDecisions).toHaveBeenCalledOnce();
  });
});
