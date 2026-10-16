import { beforeEach, describe, expect, it, vi } from "vitest";

import { runDecision, type RunDecisionResult } from "@/application/decision/index.js";

import type { ComparisonResult } from "../model/comparison.js";
import { compareDecisions } from "./compare-decisions.js";
import { runDecisionComparison } from "./run-decision-comparison.js";

vi.mock("@/application/decision/index.js", () => ({ runDecision: vi.fn() }));
vi.mock("./compare-decisions.js", () => ({ compareDecisions: vi.fn() }));
const decisionMock = vi.mocked(runDecision);
const comparisonMock = vi.mocked(compareDecisions);
const input = { repositoryPath: "/repositories/example", objective: "Review UI", filePaths: ["button.tsx"] };
const decisionResult: RunDecisionResult = {
  goal: { objective: "Actual Specialist Goal", targetRepository: "resolved-example", constraints: ["Preserve this constraint"] },
  snapshot: { repositoryRoot: "/resolved/example", commitSha: "abc123" },
  decisions: ["frontend", "ux"].map((specialistId) => ({
    specialistId, recommendation: "Show feedback", evidence: [], risks: [], uncertainty: [],
  })),
};
const comparison: ComparisonResult = { findings: [], gaps: [] };

beforeEach(() => {
  decisionMock.mockReset();
  comparisonMock.mockReset();
  decisionMock.mockResolvedValue(decisionResult);
  comparisonMock.mockResolvedValue(comparison);
});

describe("runDecisionComparison", () => {
  it("waits for Decision generation and passes original provenance objects with Comparator options", async () => {
    let finish!: (result: RunDecisionResult) => void;
    decisionMock.mockImplementationOnce(() => new Promise((resolve) => { finish = resolve; }));
    const before = structuredClone({ input, decisionResult });
    const options = { timeoutMs: 1000 };
    const pending = runDecisionComparison(input, options);
    expect(decisionMock).toHaveBeenCalledOnce();
    expect(decisionMock.mock.calls[0][0]).toBe(input);
    expect(comparisonMock).not.toHaveBeenCalled();
    finish(decisionResult);

    const result = await pending;
    expect(comparisonMock).toHaveBeenCalledOnce();
    expect(comparisonMock).toHaveBeenCalledWith({
      goal: decisionResult.goal,
      repositoryCommitSha: decisionResult.snapshot.commitSha,
      decisions: decisionResult.decisions,
    }, options);
    const [context, actualOptions] = comparisonMock.mock.calls[0];
    expect(context.goal).toBe(decisionResult.goal);
    expect(context.decisions).toBe(decisionResult.decisions);
    expect(context).not.toHaveProperty("repositoryRoot");
    expect(actualOptions).toBe(options);
    expect(result).toEqual({ ...decisionResult, comparison });
    expect(result.goal).toBe(decisionResult.goal);
    expect(result.snapshot).toBe(decisionResult.snapshot);
    expect(result.decisions).toBe(decisionResult.decisions);
    expect(result.comparison).toBe(comparison);
    expect({ input, decisionResult }).toEqual(before);
  });

  it("passes default options without introducing a separate options model", async () => {
    await runDecisionComparison(input);
    expect(comparisonMock.mock.calls[0][1]).toEqual({});
  });

  it("propagates Decision failure without calling Comparison", async () => {
    const error = new Error("Snapshot capture failed");
    decisionMock.mockRejectedValue(error);
    await expect(runDecisionComparison(input)).rejects.toBe(error);
    expect(comparisonMock).not.toHaveBeenCalled();
  });

  it("propagates Comparison failure without partial results, retry or Specialist re-execution", async () => {
    const error = new Error("Comparison reference validation failed");
    comparisonMock.mockRejectedValue(error);
    await expect(runDecisionComparison(input)).rejects.toBe(error);
    expect(decisionMock).toHaveBeenCalledOnce();
    expect(comparisonMock).toHaveBeenCalledOnce();
  });
});
