import { beforeEach, expect, it, vi } from "vitest";
import { getApprovedDecision } from "@/application/governance/index.js";
import { runWorkDecomposition } from "@/application/work-decomposition/index.js";
import { runCommand } from "@/infrastructure/process/index.js";
import { createPhaseBGraph, type PhaseBGraphOptions } from "../index.js";

vi.mock("@/application/governance/index.js", () => ({
  getApprovedDecision: vi.fn(),
}));
vi.mock("@/infrastructure/process/index.js", () => ({
  runCommand: vi.fn(),
}));
vi.mock("@/application/work-decomposition/index.js", async (importOriginal) => {
  const actual =
    await importOriginal<
      typeof import("@/application/work-decomposition/index.js")
    >();
  return {
    ...actual,
    runWorkDecomposition: vi.fn(actual.runWorkDecomposition),
  };
});

const input = { approvedDecisionId: "approved-1" };
const direction = {
  text: "Improve task entry feedback",
  sources: [{ kind: "recommendation" as const, specialistId: "ux" }],
};
const approval: ReturnType<typeof getApprovedDecision> = {
  decision: {
    id: input.approvedDecisionId,
    reviewId: "review-1",
    reviewBinding: "binding-1",
    approvalRecordId: "receipt-1",
  },
  review: {
    id: "review-1",
    binding: "binding-1",
    scopeId: "scope-1",
    scopeVersion: 1,
    revision: 0,
    analysisDigest: "digest-1",
    proposal: {
      direction,
      rationale: [direction],
      alternatives: [],
      tradeoffs: [],
      risks: [],
      unresolvedIssues: [],
      humanReviewItems: [direction],
    },
  },
  context: {
    goal: {
      objective: "Improve task entry feedback",
      targetRepository: "repo",
      constraints: ["Keep the current input format"],
    },
    repositoryCommitSha: "abc",
    assignments: [
      {
        assignmentId: "assignment-1",
        specialistId: "ux",
        objective: "Assess feedback",
      },
    ],
    decisions: [
      {
        specialistId: "ux",
        recommendation: direction.text,
        evidence: [
          {
            path: "task.ts",
            lineStart: 1,
            lineEnd: 1,
            description: "Missing feedback",
          },
        ],
        risks: [],
        uncertainty: [],
      },
    ],
    comparison: { status: "skipped", reason: "insufficient-decisions" },
  },
  snapshot: { repositoryRoot: "/example/repo", commitSha: "abc" },
};
const workItems = [
  {
    id: "feedback",
    objective: direction.text,
    deliverable: "Visible feedback and a regression check",
    dependsOn: [],
    rationale: "One independently verifiable outcome",
  },
];

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(getApprovedDecision).mockReturnValue(approval);
});

async function invoke(options: PhaseBGraphOptions) {
  const result = await createPhaseBGraph(options).invoke(input);
  expect(runWorkDecomposition).toHaveBeenCalledExactlyOnceWith(input, options);
  expect(getApprovedDecision).toHaveBeenCalledExactlyOnceWith(
    input.approvedDecisionId
  );
  return result;
}

it("returns the proposed result from one Application call", async () => {
  const agent = vi.fn().mockResolvedValue({ type: "propose", workItems });
  expect(await invoke({ agent })).toEqual({
    ...input,
    workDecompositionResult: {
      status: "proposed",
      ...input,
      workItems,
    },
  });
  expect(agent).toHaveBeenCalledExactlyOnceWith(
    expect.objectContaining({ goal: approval.context.goal })
  );
});

it("preserves escalation and ends the graph", async () => {
  const questions = ["Which acceptance condition applies?"];
  const agent = vi.fn().mockResolvedValue({
    type: "escalate",
    reason: "Human judgment needed",
    questions,
  });
  expect(await invoke({ agent })).toEqual({
    ...input,
    workDecompositionResult: {
      status: "escalated",
      reason: "Human judgment needed",
      questions,
    },
  });
});

it("preserves invalid approval failure and ends before calling the agent", async () => {
  vi.mocked(getApprovedDecision).mockImplementationOnce(() => {
    throw new Error("ApprovedDecision is unavailable.");
  });
  const agent = vi.fn();
  expect(await invoke({ agent })).toEqual({
    ...input,
    workDecompositionResult: {
      status: "failed",
      failure: "invalid-input",
      reason: "Approved Decision could not be restored for Work Decomposition.",
    },
  });
  expect(agent).not.toHaveBeenCalled();
});

it("preserves agent execution failure and ends without retry", async () => {
  const agent = vi.fn().mockRejectedValue(new Error("Agent unavailable"));
  expect(await invoke({ agent })).toEqual({
    ...input,
    workDecompositionResult: {
      status: "failed",
      failure: "agent-execution",
      reason: "CEO Work Decomposition execution failed.",
    },
  });
  expect(agent).toHaveBeenCalledOnce();
});

it("passes timeout to the default Codex adapter without storing it in State", async () => {
  vi.mocked(runCommand).mockResolvedValueOnce({
    stdout: JSON.stringify({ type: "propose", workItems }),
    stderr: "",
    exitCode: 0,
    timedOut: false,
  });
  expect(await invoke({ timeoutMs: 3210 })).toEqual({
    ...input,
    workDecompositionResult: { status: "proposed", ...input, workItems },
  });
  expect(runCommand).toHaveBeenCalledExactlyOnceWith(
    "codex",
    expect.arrayContaining(["read-only"]),
    expect.objectContaining({ timeoutMs: 3210 })
  );
});
