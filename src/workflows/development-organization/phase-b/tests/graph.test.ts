import {
  executeAssignmentRead,
  executeWorkItem,
} from "@/application/execution/index.js";
import { beforeEach, expect, it, vi } from "vitest";
import { createAssignmentPlan } from "@/application/planning/index.js";
import {
  getApprovedDecision,
  getPreparedAssignmentPlan,
  verifyExecutionHandoff,
} from "@/application/governance/index.js";
import { runWorkDecomposition } from "@/application/work-decomposition/index.js";
import { beginValidatedWorkItemExecutionSource } from "@/application/governance/authorization/features/work-item-execution/flow/register-work-item-execution-source.js";
import { runCommand } from "@/infrastructure/process/index.js";
import {
  createPhaseBGraph,
  type PhaseBGraphOptions,
  type PhaseBHandoff,
} from "../index.js";

vi.mock("@/application/planning/index.js", () => ({
  createAssignmentPlan: vi.fn(),
}));

vi.mock("@/application/execution/index.js", () => ({
  executeAssignmentRead: vi.fn(),
  executeWorkItem: vi
    .fn()
    .mockResolvedValue({ status: "blocked", reason: "Runtime unsupported." }),
}));
vi.mock("@/application/governance/index.js", async () => ({
  approvedDecisionSchema: (
    await import("@/application/governance/approval/features/direction-review/model/result.js")
  ).approvedDecisionSchema,
  executionDelegationSchema: (
    await import("@/application/governance/approval/features/execution-delegation/model/execution-delegation.js")
  ).executionDelegationSchema,
  getApprovedDecision: vi.fn(),
  getPreparedAssignmentPlan: vi.fn(),
  getAssignmentExecutionResults: () => [],
  verifyExecutionHandoff: vi.fn(),
}));
vi.mock(
  "@/application/governance/records/work-decomposition-records.js",
  () => ({
    registerWorkDecomposition: vi.fn(),
  })
);
vi.mock(
  "@/application/governance/authorization/features/work-item-execution/flow/register-work-item-execution-source.js",
  () => ({
    beginValidatedWorkItemExecutionSource: vi.fn(),
  })
);
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

const decompositionInput = { approvedDecisionId: "approved-1" };
const direction = {
  text: "Improve task entry feedback",
  sources: [{ kind: "recommendation" as const, specialistId: "ux" }],
};
const approval: ReturnType<typeof getApprovedDecision> = {
  decision: {
    id: decompositionInput.approvedDecisionId,
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
const handoff: PhaseBHandoff = {
  status: "completed",
  decision: approval.decision,
  executionDelegation: {
    id: "delegation-1",
    approvedDecisionId: approval.decision.id,
    repositoryRoot: approval.snapshot.repositoryRoot,
    grant: {
      readPaths: ["task.ts"],
      writePaths: ["task.ts"],
      shellCommands: [],
      budget: { maxExecutions: 1, maxTimeoutMs: 1000 },
      expiresAt: "2030-01-01T00:00:00.000Z",
      policyVersion: 1,
    },
    status: "active",
    approvalRecordId: "receipt-1",
    confirmationBinding: "confirmation",
    approval: {
      id: "receipt-1",
      uid: 1,
      confirmedAt: "2026-01-01T00:00:00.000Z",
    },
    issuedAt: "2026-01-01T00:00:00.000Z",
  },
};
const input = { handoff };
const accepted = { handoffResult: { status: "accepted", handoff } };

const workItems = [
  {
    id: "feedback",
    objective: direction.text,
    deliverable: "Visible feedback and a regression check",
    dependsOn: [],
  },
];

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(beginValidatedWorkItemExecutionSource).mockReset();
  vi.mocked(getApprovedDecision).mockReturnValue(approval);
  vi.mocked(verifyExecutionHandoff).mockReturnValue({
    decision: handoff.decision,
    executionDelegation: handoff.executionDelegation,
  });
});

async function invoke(options: PhaseBGraphOptions) {
  const result = await createPhaseBGraph(options).invoke(input);
  expect(runWorkDecomposition).toHaveBeenCalledExactlyOnceWith(
    decompositionInput,
    {
      ...options.workDecomposition,
      executionDelegationGrant: handoff.executionDelegation.grant,
    }
  );
  expect(getApprovedDecision).toHaveBeenCalledExactlyOnceWith(
    decompositionInput.approvedDecisionId
  );
  return result;
}

it("returns the proposed result from one Application call", async () => {
  const agent = vi.fn().mockResolvedValue({ type: "propose", workItems });
  expect(await invoke({ workDecomposition: { agent } })).toEqual({
    ...input,
    ...accepted,
    workDecompositionResult: {
      status: "proposed",
      ...decompositionInput,
      workItems,
    },
  });
  expect(agent).toHaveBeenCalledExactlyOnceWith(
    expect.objectContaining({
      goal: approval.context.goal,
      executionDelegationGrant: handoff.executionDelegation.grant,
    })
  );
});

it("preserves escalation and ends the graph", async () => {
  const questions = ["Which acceptance condition applies?"];
  const agent = vi.fn().mockResolvedValue({
    type: "escalate",
    reason: "Human judgment needed",
    questions,
  });
  expect(await invoke({ workDecomposition: { agent } })).toEqual({
    ...input,
    ...accepted,
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
  expect(await invoke({ workDecomposition: { agent } })).toEqual({
    ...input,
    ...accepted,
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
  expect(await invoke({ workDecomposition: { agent } })).toEqual({
    ...input,
    ...accepted,
    workDecompositionResult: {
      status: "failed",
      failure: "agent-execution",
      reason: "CEO Work Decomposition execution failed.",
    },
  });
  expect(agent).toHaveBeenCalledOnce();
});

it("passes timeout to the default Codex adapter without storing it in State", async () => {
  const typedWorkItems = workItems.map((item) => ({
    ...item,
  }));
  vi.mocked(runCommand).mockResolvedValueOnce({
    stdout: JSON.stringify({ type: "propose", workItems: typedWorkItems }),
    stderr: "",
    exitCode: 0,
    timedOut: false,
  });
  expect(await invoke({ workDecomposition: { timeoutMs: 3210 } })).toEqual({
    ...input,
    ...accepted,
    workDecompositionResult: {
      status: "proposed",
      ...decompositionInput,
      workItems: typedWorkItems,
    },
  });
  expect(runCommand).toHaveBeenCalledExactlyOnceWith(
    "codex",
    expect.arrayContaining(["read-only"]),
    expect.objectContaining({ timeoutMs: 3210 })
  );
});

const feedback = { ...workItems[0], dependsOn: [] };
const docs = { ...feedback, id: "docs", objective: "Update documentation" };
const api = { ...feedback, id: "api", objective: "Update API behavior" };
const client = {
  ...feedback,
  id: "client",
  objective: "Integrate API",
  dependsOn: [api.id],
};

it.each([
  { name: "Single Work", items: [feedback], selected: [feedback] },
  {
    name: "Independent Works",
    items: [feedback, docs],
    selected: [feedback, docs],
  },
  { name: "Dependent Works", items: [api, client], selected: [client, api] },
  {
    name: "Mixed Dependencies",
    items: [api, client, docs],
    selected: [client, docs],
  },
])(
  "selects Work Items for $name without starting Assignment Planning",
  async ({ items, selected }) => {
    const selectWorkItemIds = vi.fn(() => selected.map(({ id }) => id));
    const result = await createPhaseBGraph({
      workDecomposition: {
        agent: async () => ({ type: "propose", workItems: items }),
      },
      selectWorkItemIds,
    }).invoke(input);
    expect(selectWorkItemIds).toHaveBeenCalledExactlyOnceWith(items);
    expect(result.selectedWorkItemIds).toEqual(selected.map(({ id }) => id));
    expect(createAssignmentPlan).not.toHaveBeenCalled();
  }
);

it.each([
  { planning: { detailed: {} } },
  { execution: { workItem: { workItemId: "api" } } },
  {
    workDecomposition: {
      executionDelegationGrant: handoff.executionDelegation.grant,
    },
  },
  { assignmentExecution: { contexts: {}, workItem: { workItemId: "api" } } },
])(
  "rejects unsupported options before calling Governance or running work",
  (options) => {
    expect(() => createPhaseBGraph(options as PhaseBGraphOptions)).toThrow(
      "Unsupported Phase B Graph options"
    );
    expect(verifyExecutionHandoff).not.toHaveBeenCalled();
    expect(createAssignmentPlan).not.toHaveBeenCalled();
    expect(beginValidatedWorkItemExecutionSource).not.toHaveBeenCalled();
    expect(executeWorkItem).not.toHaveBeenCalled();
    expect(executeAssignmentRead).not.toHaveBeenCalled();
  }
);

it("requires selection and a planning agent for an execution request", () => {
  expect(() => createPhaseBGraph({ assignmentPlanning: vi.fn() })).toThrow(
    "requires Work Item selection"
  );
  expect(() =>
    createPhaseBGraph({ assignmentExecution: { contexts: {} } })
  ).toThrow("requires Assignment Planning");
});

it.each([
  { type: "escalate", reason: "Need clarification", questions: ["Which API?"] },
  { type: "propose", workItems: [] },
])(
  "skips selection and assignment when decomposition is not proposed",
  async (action) => {
    const selectWorkItemIds = vi.fn(() => [feedback.id]);
    const result = await createPhaseBGraph({
      workDecomposition: { agent: async () => action },
      selectWorkItemIds,
      assignmentPlanning: vi.fn(),
      assignmentExecution: { contexts: {} },
    }).invoke(input);
    expect(result.workDecompositionResult?.status).not.toBe("proposed");
    expect(selectWorkItemIds).not.toHaveBeenCalled();
    expect(createAssignmentPlan).not.toHaveBeenCalled();
    expect(executeAssignmentRead).not.toHaveBeenCalled();
  }
);

it("stops before selection when Handoff verification is denied", async () => {
  vi.mocked(verifyExecutionHandoff).mockImplementationOnce(() => {
    throw new Error("denied");
  });
  const selectWorkItemIds = vi.fn();
  const result = await createPhaseBGraph({
    selectWorkItemIds,
    assignmentPlanning: vi.fn(),
    assignmentExecution: { contexts: {} },
  }).invoke(input);
  expect(result.handoffResult?.status).toBe("denied");
  expect(runWorkDecomposition).not.toHaveBeenCalled();
  expect(selectWorkItemIds).not.toHaveBeenCalled();
  expect(executeAssignmentRead).not.toHaveBeenCalled();
});

it("validates all selected IDs before Assignment Planning", async () => {
  const graph = createPhaseBGraph({
    workDecomposition: {
      agent: async () => ({ type: "propose", workItems: [feedback] }),
    },
    selectWorkItemIds: () => [feedback.id, "unknown"],
    assignmentPlanning: vi.fn(),
  });
  await expect(graph.invoke(input)).rejects.toThrow(
    "Planning selection contains an unknown Work Item ID."
  );
  expect(createAssignmentPlan).not.toHaveBeenCalled();
});

it("skips Assignment Planning and Execution for an empty selection", async () => {
  const result = await createPhaseBGraph({
    workDecomposition: {
      agent: async () => ({ type: "propose", workItems: [feedback] }),
    },
    selectWorkItemIds: () => [],
    assignmentPlanning: vi.fn(),
    assignmentExecution: { contexts: {} },
  }).invoke(input);
  expect(result.selectedWorkItemIds).toEqual([]);
  expect(createAssignmentPlan).not.toHaveBeenCalled();
  expect(executeAssignmentRead).not.toHaveBeenCalled();
});

it("takes the selection and Plan only from the current Graph run", async () => {
  const graph = createPhaseBGraph({
    workDecomposition: {
      agent: async () => ({ type: "propose", workItems: [feedback, docs] }),
    },
    selectWorkItemIds: () => [feedback.id, feedback.id],
  });
  const suppliedState = {
    ...input,
    selectedWorkItemIds: [docs.id],
    assignmentPlanResult: { status: "prepared", plan: { id: "forged" } },
  };
  const first = await graph.invoke(suppliedState);
  expect(first.selectedWorkItemIds).toEqual([feedback.id]);
  expect(first.assignmentPlanResult).toBeUndefined();
  expect(await graph.invoke(input)).toEqual(first);
});

const combinedItems = [
  {
    ...workItems[0],
    id: "ready",
  },
  {
    ...workItems[0],
    id: "awaiting",
  },
  { ...workItems[0], id: "analysis" },
  {
    ...workItems[0],
    id: "without-worker",
  },
];
const combinedPlan = {
  id: "plan",
  decompositionBinding: "binding",
  staffingBinding: "staffing",
  selectedWorkItemIds: combinedItems.map(({ id }) => id),
  snapshot: approval.snapshot,
  assignments: [
    {
      id: "review",
      workItemId: "awaiting",
      specialistId: "ux",
      repositoryAccessCeiling: "read" as const,
      objective: "Review",
      deliverable: "Findings",
      dependsOn: [],
    },
    ...["ready", "awaiting"].map((id) => ({
      id,
      workItemId: id,
      specialistId: "ux",
      repositoryAccessCeiling: "write" as const,
      objective: "Implement",
      deliverable: "Patch",
      dependsOn: id === "awaiting" ? ["review"] : [],
    })),
  ],
};

it.each([
  ["prepared", false],
  ["prepared", true],
  ["denied", true],
] as const)(
  "coordinates Assignments when Assignment Planning is %s and execution requested is %s",
  async (status, requested) => {
    const assignmentResult =
      status === "prepared"
        ? { status, plan: combinedPlan }
        : {
            status,
            failure: "provenance" as const,
            reason: "Approval unavailable",
          };
    vi.mocked(createAssignmentPlan).mockResolvedValueOnce(assignmentResult);
    const shouldExecute = requested && status === "prepared";
    vi.mocked(getPreparedAssignmentPlan).mockReturnValueOnce({
      plan: combinedPlan,
      workItems: combinedItems,
      specialistSources: [],
    });
    vi.mocked(executeAssignmentRead).mockResolvedValueOnce({
      status: "read-completed",
      invocationId: "invocation",
      resultDigest: "digest",
    });
    const selectWorkItemIds = vi.fn(() => combinedItems.map(({ id }) => id));
    const agent = vi.fn();
    const result = await createPhaseBGraph({
      workDecomposition: {
        agent: async () => ({ type: "propose", workItems: combinedItems }),
      },
      selectWorkItemIds,
      assignmentPlanning: agent,
      ...(requested && {
        assignmentExecution: {
          contexts: {
            ready: {
              readScopes: [{ kind: "file", path: "README.md" }],
              timeoutMs: 1000,
            },
          },
        },
      }),
    }).invoke(input);

    expect(selectWorkItemIds).toHaveBeenCalledOnce();
    expect(result.selectedWorkItemIds).toEqual([
      "ready",
      "awaiting",
      "analysis",
      "without-worker",
    ]);
    expect(createAssignmentPlan).toHaveBeenCalledExactlyOnceWith(
      handoff,
      result.workDecompositionResult,
      result.selectedWorkItemIds,
      agent
    );
    expect(result.assignmentPlanResult).toEqual(assignmentResult);
    expect(beginValidatedWorkItemExecutionSource).not.toHaveBeenCalled();
    expect(executeWorkItem).not.toHaveBeenCalled();
    expect(getPreparedAssignmentPlan).toHaveBeenCalledTimes(
      shouldExecute ? 1 : 0
    );
    expect(executeAssignmentRead).toHaveBeenCalledTimes(shouldExecute ? 1 : 0);
    if (shouldExecute) {
      expect(result.assignmentExecutionResult).toMatchObject({
        status: "pending",
        results: [{ assignmentId: "ready", status: "read-completed" }],
      });
    } else {
      expect(result.assignmentExecutionResult).toBeUndefined();
    }
  }
);
