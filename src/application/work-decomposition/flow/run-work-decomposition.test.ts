import { beforeEach, describe, expect, it, vi } from "vitest";
import { getApprovedDecision } from "@/application/governance/index.js";
import { runCommand } from "@/infrastructure/process/index.js";
import { runWorkDecomposition, type WorkItem } from "../index.js";

vi.mock("@/application/governance/index.js", () => ({
  getApprovedDecision: vi.fn(),
}));
vi.mock("@/infrastructure/process/index.js", () => ({
  runCommand: vi.fn(),
}));

const lookup = vi.mocked(getApprovedDecision);
const command = vi.mocked(runCommand);
const input = { approvedDecisionId: "approved-1" };
const statement = {
  text: "Improve accessibility and retain existing behavior",
  sources: [{ kind: "recommendation" as const, specialistId: "ux" }],
};
const approved: ReturnType<typeof getApprovedDecision> = {
  decision: {
    id: input.approvedDecisionId,
    reviewId: "review-1",
    reviewBinding: "private-binding",
    approvalRecordId: "approval-1",
  },
  review: {
    id: "review-1",
    binding: "private-binding",
    scopeId: "scope-1",
    scopeVersion: 1,
    revision: 0,
    analysisDigest: "private-digest",
    proposal: {
      direction: statement,
      rationale: [statement],
      alternatives: [],
      risks: [statement],
      tradeoffs: [
        {
          benefit: "Better feedback",
          cost: "More UI states",
          reason: "Accessibility",
          sources: statement.sources,
        },
      ],
      unresolvedIssues: [statement],
      humanReviewItems: [statement],
    },
  },
  context: {
    goal: {
      objective: "Improve task entry",
      targetRepository: "repo",
      constraints: ["Retain existing behavior"],
    },
    repositoryCommitSha: "abc",
    assignments: [
      {
        assignmentId: "assignment-1",
        specialistId: "ux",
        objective: "Review UI",
      },
    ],
    decisions: [
      {
        specialistId: "ux",
        recommendation: "Improve feedback",
        evidence: [
          {
            path: "task.ts",
            lineStart: 1,
            lineEnd: 1,
            description: "Feedback is missing",
          },
        ],
        risks: ["Regression"],
        uncertainty: [],
      },
    ],
    comparison: { status: "skipped", reason: "insufficient-decisions" },
  },
  snapshot: { repositoryRoot: "/example/repo", commitSha: "abc" },
};

function work(id: string, ...dependsOn: string[]): WorkItem {
  return {
    id,
    objective: `Complete ${id}`,
    deliverable: `Result for ${id}`,
    dependsOn,
    rationale: "Independently verifiable",
  };
}

beforeEach(() => {
  vi.resetAllMocks();
  lookup.mockReturnValue(approved);
});

describe("runWorkDecomposition", () => {
  it.each([
    {
      name: "Single Work",
      items: [
        {
          ...work("task-entry"),
          suggestedRoles: ["Accessibility reviewer", "Frontend developer"],
        },
      ],
    },
    {
      name: "Independent Works",
      items: [work("stats"), work("notifications")],
    },
    {
      name: "Dependent Works",
      items: [
        work("integration", "frontend", "api"),
        work("frontend", "api"),
        work("api"),
      ],
    },
    {
      name: "Mixed Dependencies",
      items: [
        work("integration", "frontend"),
        work("frontend", "api"),
        work("api"),
        work("notifications"),
      ],
    },
  ])("preserves the proposed Work Items for $name", async ({ items }) => {
    const agent = vi
      .fn()
      .mockResolvedValue({ type: "propose", workItems: items });
    expect(await runWorkDecomposition(input, { agent })).toEqual({
      status: "proposed",
      approvedDecisionId: input.approvedDecisionId,
      workItems: items,
    });
    expect(lookup).toHaveBeenCalledExactlyOnceWith(input.approvedDecisionId);
    expect(agent).toHaveBeenCalledExactlyOnceWith({
      goal: approved.context.goal,
      decisions: approved.context.decisions,
      comparison: approved.context.comparison,
      proposal: approved.review.proposal,
      snapshot: approved.snapshot,
      approvalSource: {
        approvedDecisionId: input.approvedDecisionId,
        reviewId: "review-1",
        approvalRecordId: "approval-1",
      },
    });
    expect(agent.mock.calls[0][0].goal).not.toBe(approved.context.goal);
  });

  it.each([
    {
      name: "duplicate ID",
      items: [work("same"), work(" same ")],
      reason: "Duplicate Work Item ID.",
    },
    {
      name: "unknown dependency",
      items: [work("api", "missing")],
      reason: "Unknown Work Item dependency.",
    },
    {
      name: "self reference",
      items: [work("api", "api")],
      reason: "Work Item cannot depend on itself.",
    },
    {
      name: "cycle alongside independent work",
      items: [
        work("a", "c"),
        work("b", "a"),
        work("c", "b"),
        work("independent"),
      ],
      reason: "Cyclic Work Item dependencies.",
    },
  ])("rejects $name", async ({ items, reason }) => {
    expect(
      await runWorkDecomposition(input, {
        agent: async () => ({ type: "propose", workItems: items }),
      })
    ).toEqual({ status: "failed", failure: "invalid-dependencies", reason });
  });

  it.each(
    [
      [],
      [{ ...work("api"), objective: " " }],
      [{ ...work("api"), deliverable: undefined }],
      [{ ...work("api"), authority: { repositoryAccess: "write" } }],
      [{ ...work("api"), specialistId: "registered-specialist" }],
    ].map((items) => ({ items }))
  )("rejects an invalid Work Item list $items", async ({ items }) => {
    expect(
      await runWorkDecomposition(input, {
        agent: async () => ({ type: "propose", workItems: items }),
      })
    ).toMatchObject({ status: "failed", failure: "invalid-output" });
  });

  it("rejects invalid input before querying Governance", async () => {
    expect(
      await runWorkDecomposition({ approvedDecisionId: " " })
    ).toMatchObject({
      status: "failed",
      failure: "invalid-input",
    });
    expect(lookup).not.toHaveBeenCalled();
    expect(command).not.toHaveBeenCalled();
  });

  it("stops when Governance cannot resolve the Approved Decision", async () => {
    lookup.mockImplementation(() => {
      throw new Error("Private ledger error");
    });
    expect(await runWorkDecomposition(input)).toEqual({
      status: "failed",
      failure: "invalid-input",
      reason: "Approved Decision could not be restored for Work Decomposition.",
    });
    expect(command).not.toHaveBeenCalled();
  });

  it("returns questions for Human judgment on escalation", async () => {
    const action = {
      type: "escalate",
      reason: "Unclear accessibility target",
      questions: ["Which target applies?"],
    };
    expect(
      await runWorkDecomposition(input, { agent: async () => action })
    ).toEqual({
      status: "escalated",
      reason: action.reason,
      questions: action.questions,
    });
  });

  it("runs the default CEO through context-only Codex", async () => {
    command.mockResolvedValue({
      stdout: JSON.stringify({
        type: "propose",
        workItems: [work("task-entry")],
      }),
      stderr: "",
      exitCode: 0,
      timedOut: false,
    });
    expect(
      await runWorkDecomposition(input, { timeoutMs: 1234 })
    ).toMatchObject({ status: "proposed" });
    expect(command).toHaveBeenCalledOnce();
    const [executable, args, options] = command.mock.calls[0];
    expect(executable).toBe("codex");
    expect(args).toContain("read-only");
    expect(args?.at(-1)).toContain(JSON.stringify(approved.review.proposal));
    expect(args?.at(-1)).not.toContain(approved.decision.reviewBinding);
    expect(options?.timeoutMs).toBe(1234);
  });

  it.each([
    { exitCode: 1, timedOut: false, stdout: "", failure: "agent-execution" },
    { exitCode: null, timedOut: true, stdout: "", failure: "timeout" },
    { exitCode: 0, timedOut: false, stdout: "{", failure: "malformed-json" },
    { exitCode: 0, timedOut: false, stdout: "null", failure: "invalid-output" },
  ])(
    "classifies Codex failures as $failure",
    async ({ failure, ...result }) => {
      command.mockResolvedValue({ ...result, stderr: "Private process error" });
      const response = await runWorkDecomposition(input);
      expect(response).toMatchObject({ status: "failed", failure });
      expect(JSON.stringify(response)).not.toContain("Private process error");
    }
  );
});
