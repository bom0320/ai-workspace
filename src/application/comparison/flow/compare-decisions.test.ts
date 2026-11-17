import { beforeEach, describe, expect, it, vi } from "vitest";

import { runCodexComparator } from "../comparator/codex-comparator.js";
import type { ComparisonPayload } from "../protocol/comparison.js";
import type { ComparisonContext } from "../protocol/context.js";
import { compareDecisions } from "./compare-decisions.js";
import { validateComparisonReferences } from "./validation/validate-references.js";

vi.mock("../comparator/codex-comparator.js", () => ({
  runCodexComparator: vi.fn(),
}));
vi.mock("./validation/validate-references.js", () => ({
  validateComparisonReferences: vi.fn(),
}));

const comparatorMock = vi.mocked(runCodexComparator);
const validationMock = vi.mocked(validateComparisonReferences);
const context: ComparisonContext = {
  goal: { objective: "Review pending behavior", targetRepository: "example" },
  repositoryCommitSha: "abc123",
  decisions: ["frontend", "ux"].map((specialistId) => ({
    specialistId,
    recommendation: "Show pending feedback",
    evidence: [],
    risks: [],
    uncertainty: [],
  })),
};
const payload: ComparisonPayload = {
  findings: [
    {
      concern: "Pending feedback",
      relation: "agreement",
      positions: context.decisions.map(({ specialistId }) => ({
        specialistId,
        statement: "Show pending feedback",
        evidenceIndexes: [],
      })),
      rationale: "Both support visible feedback",
    },
  ],
  gaps: [],
};

beforeEach(() => {
  comparatorMock.mockReset();
  validationMock.mockReset();
  comparatorMock.mockResolvedValue(payload);
});

describe("compareDecisions", () => {
  it("awaits Comparator output, validates references and returns the same payload", async () => {
    const before = structuredClone(context);
    const options = { timeoutMs: 1234 };
    let finish!: (output: ComparisonPayload) => void;
    comparatorMock.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          finish = resolve;
        })
    );

    const result = compareDecisions(context, options);
    expect(comparatorMock).toHaveBeenCalledOnce();
    expect(comparatorMock).toHaveBeenCalledWith(context, options);
    expect(comparatorMock.mock.calls[0][0]).toBe(context);
    expect(comparatorMock.mock.calls[0][1]).toBe(options);
    expect(validationMock).not.toHaveBeenCalled();
    finish(payload);

    expect(await result).toBe(payload);
    expect(validationMock).toHaveBeenCalledOnce();
    expect(validationMock.mock.calls[0][0]).toBe(context);
    expect(validationMock.mock.calls[0][1]).toBe(payload);
    expect(context).toEqual(before);
  });

  it("uses existing empty default options", async () => {
    await compareDecisions(context);
    expect(comparatorMock).toHaveBeenCalledWith(context, {});
  });

  it("propagates Comparator failure without wrapping or reference validation", async () => {
    const error = new Error("Codex comparator timed out");
    comparatorMock.mockRejectedValue(error);
    await expect(compareDecisions(context)).rejects.toBe(error);
    expect(validationMock).not.toHaveBeenCalled();
  });

  it("propagates Reference Validation failure without returning a result", async () => {
    const error = new Error("Unknown comparison specialist: backend.");
    validationMock.mockImplementation(() => {
      throw error;
    });
    await expect(compareDecisions(context)).rejects.toBe(error);
    expect(comparatorMock).toHaveBeenCalledOnce();
  });

  it.each([0, 1])(
    "rejects %s source Decisions before calling Comparator",
    async (count) => {
      await expect(
        compareDecisions({
          ...context,
          decisions: context.decisions.slice(0, count),
        })
      ).rejects.toThrow("Comparison requires at least two decisions.");
      expect(comparatorMock).not.toHaveBeenCalled();
      expect(validationMock).not.toHaveBeenCalled();
    }
  );

  it("rejects duplicate source Specialist IDs before calling Comparator", async () => {
    await expect(
      compareDecisions({
        ...context,
        decisions: [...context.decisions, context.decisions[0]],
      })
    ).rejects.toThrow("Duplicate comparison source specialist: frontend.");
    expect(comparatorMock).not.toHaveBeenCalled();
    expect(validationMock).not.toHaveBeenCalled();
  });

  it.each(["", "   ", "\t\n"])(
    "rejects an empty or whitespace commit SHA: %j",
    async (repositoryCommitSha) => {
      await expect(
        compareDecisions({ ...context, repositoryCommitSha })
      ).rejects.toThrow("Comparison repository commit SHA is required.");
      expect(comparatorMock).not.toHaveBeenCalled();
      expect(validationMock).not.toHaveBeenCalled();
    }
  );

  it("accepts an empty comparison result after Reference Validation", async () => {
    const empty = { findings: [], gaps: [] };
    comparatorMock.mockResolvedValue(empty);
    expect(await compareDecisions(context)).toBe(empty);
    expect(validationMock).toHaveBeenCalledWith(context, empty);
  });
});
