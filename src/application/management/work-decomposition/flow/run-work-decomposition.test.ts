import { beforeEach, describe, expect, it, vi } from "vitest";
import type { getApprovedDecision } from "@/application/governance/index.js";
import { runCommand } from "@/infrastructure/process/index.js";
import { decomposeApprovedWork } from "../index.js";
import { type WorkItem } from "@/contracts/management/work-item.js";

vi.mock("@/infrastructure/process/index.js", () => ({
  runCommand: vi.fn(),
}));

const command = vi.mocked(runCommand);

const statement = {
  text: "Improve accessibility and retain existing behavior",
  sources: [{ kind: "recommendation" as const, specialistId: "ux" }],
};
const approved: ReturnType<typeof getApprovedDecision> = {
  decision: {
    id: "approved-1",
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

const executionDelegationGrant = {
  readScopes: [{ kind: "file" as const, path: "task.ts" }],
  writeScopes: [],
  shellCommands: [],
  budget: { maxExecutions: 1, maxTimeoutMs: 5000 },
  policyVersion: 1,
  expiresAt: "2099-01-01T00:00:00Z",
};
const input = {
  handoff: { decision: approved.decision },
  approved: {
    context: approved.context,
    synthesisProposal: approved.review.proposal,
    snapshot: approved.snapshot,
  },
  executionDelegationGrant,
};

function work(id: string, ...dependsOn: string[]): WorkItem {
  return {
    id,
    objective: `Complete ${id}`,
    deliverable: `Result for ${id}`,
    dependsOn,
  };
}

beforeEach(() => {
  vi.resetAllMocks();
});

describe("decomposeApprovedWork", () => {
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
        {
          id: "auth-contract",
          objective: "Define the authentication API contract",
          deliverable: "Shared request, response, and error definitions",
          dependsOn: [],
          rationale:
            "The frontend and backend need a shared contract they can review independently of implementation.",
        },
        {
          id: "auth-server",
          objective: "Implement the authentication API and session management",
          deliverable: "Server endpoints and session lifecycle tests",
          dependsOn: ["auth-contract"],
          rationale:
            "Server-side security and session behavior require their own verification boundary.",
        },
        {
          id: "login-ui",
          objective: "Implement the login UI and client state management",
          deliverable: "Login screen and client interaction tests",
          dependsOn: ["auth-contract"],
          rationale:
            "Client interaction and state belong to the frontend and have distinct acceptance criteria.",
        },
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
    expect(await decomposeApprovedWork(input, { agent })).toEqual({
      status: "proposed",
      approvedDecisionId: approved.decision.id,
      workItems: items,
    });
    expect(agent).toHaveBeenCalledExactlyOnceWith({
      goal: approved.context.goal,
      decisions: approved.context.decisions,
      comparison: approved.context.comparison,
      proposal: approved.review.proposal,
      snapshot: approved.snapshot,
      executionDelegationGrant,
      approvalSource: {
        approvedDecisionId: approved.decision.id,
        reviewId: "review-1",
        approvalRecordId: "approval-1",
      },
    });
    expect(agent.mock.calls[0][0].goal).not.toBe(approved.context.goal);
  });

  it.each([
    [{ kind: "evidence", specialistId: "ux", index: 0 }, true],
    [{ kind: "evidence", specialistId: "ux", index: 1 }, false],
    [{ kind: "recommendation", specialistId: "unapproved" }, false],
    [{ kind: "finding", index: 0 }, false],
  ] as const)(
    "checks Work Item source %j against approved analysis",
    async (source, valid) => {
      const workItem = { ...work("feedback"), sources: [source] };
      const result = await decomposeApprovedWork(input, {
        agent: async () => ({ type: "propose", workItems: [workItem] }),
      });
      expect(result).toMatchObject(
        valid
          ? { status: "proposed", workItems: [workItem] }
          : { status: "failed", failure: "invalid-output" }
      );
    }
  );

  it("rejects a source when the Specialist ID matches multiple approved decisions", async () => {
    const ambiguous = {
      ...input,
      approved: {
        ...input.approved,
        context: {
          ...approved.context,
          decisions: [
            approved.context.decisions[0],
            approved.context.decisions[0],
          ],
        },
      },
    };
    const result = await decomposeApprovedWork(ambiguous, {
      agent: async () => ({
        type: "propose",
        workItems: [
          {
            ...work("feedback"),
            sources: [{ kind: "recommendation", specialistId: "ux" }],
          },
        ],
      }),
    });
    expect(result).toMatchObject({
      status: "failed",
      failure: "invalid-output",
    });
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
      await decomposeApprovedWork(input, {
        agent: async () => ({ type: "propose", workItems: items }),
      })
    ).toEqual({ status: "failed", failure: "invalid-dependencies", reason });
  });

  it.each(
    [
      [],
      [{ ...work("api"), objective: " " }],
      [{ ...work("api"), deliverable: undefined }],
      [{ ...work("api"), rationale: "" }],
      [{ ...work("api"), rationale: "   " }],
      [{ ...work("api"), authority: { repositoryAccess: "write" } }],
      [{ ...work("api"), specialistId: "registered-specialist" }],
    ].map((items) => ({ items }))
  )("rejects an invalid Work Item list $items", async ({ items }) => {
    expect(
      await decomposeApprovedWork(input, {
        agent: async () => ({ type: "propose", workItems: items }),
      })
    ).toMatchObject({ status: "failed", failure: "invalid-output" });
  });

  it("returns questions for Human judgment on escalation", async () => {
    const action = {
      type: "escalate",
      reason: "Unclear accessibility target",
      questions: ["Which target applies?"],
    };
    expect(
      await decomposeApprovedWork(input, { agent: async () => action })
    ).toEqual({
      status: "escalated",
      reason: action.reason,
      questions: action.questions,
    });
  });

  it("rejects the removed execution type from the default CEO", async () => {
    command.mockResolvedValue({
      stdout: JSON.stringify({
        type: "propose",
        workItems: [{ ...work("task-entry"), workType: "read-only" }],
      }),
      stderr: "",
      exitCode: 0,
      timedOut: false,
    });
    expect(await decomposeApprovedWork(input)).toMatchObject({
      status: "failed",
      failure: "invalid-output",
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
      await decomposeApprovedWork(input, {
        timeoutMs: 1234,
      })
    ).toMatchObject({ status: "proposed" });
    expect(command).toHaveBeenCalledOnce();
    const [executable, args, options] = command.mock.calls[0];
    expect(executable).toBe("codex");
    expect(args).toContain("read-only");
    expect(args?.at(-1)).toContain(JSON.stringify(approved.review.proposal));
    const prompt = args?.at(-1) ?? "";
    expect(prompt).toContain("within the supplied executionDelegationGrant");
    expect(
      JSON.parse(prompt.split("WorkDecompositionContext:\n")[1])
        .executionDelegationGrant
    ).toEqual(executionDelegationGrant);
    expect(args?.at(-1)).toContain('Optional fields are "rationale"');
    expect(args?.at(-1)).toContain("Do not use rationale to repeat dependsOn");
    expect(args?.at(-1)).not.toContain(approved.decision.reviewBinding);
    expect(args?.at(-1)).not.toContain("workType");
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
      const response = await decomposeApprovedWork(input);
      expect(response).toMatchObject({ status: "failed", failure });
      expect(JSON.stringify(response)).not.toContain("Private process error");
    }
  );
});
