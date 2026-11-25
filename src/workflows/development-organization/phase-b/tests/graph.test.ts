import {
  executeCollaborativeAssignment,
  executeWorkItem,
} from "@/application/execution/index.js";
import { beforeEach, expect, it, vi } from "vitest";
import {
  prepareAssignmentPlan,
  type PlanningResult,
} from "@/application/planning/index.js";
import {
  getApprovedDecision,
  getPreparedAssignmentPlan,
  verifyExecutionHandoff,
} from "@/application/governance/index.js";
import { runWorkDecomposition } from "@/application/work-decomposition/index.js";
import { beginValidatedWorkItemExecutionSource } from "@/application/governance/authorization/features/work-item-execution/flow/register-work-item-execution-source.js";
import { runCommand } from "@/infrastructure/process/index.js";
import { executeWorkItemPlanning } from "../features/planning/execution/execute-work-item-planning.js";
import {
  createPhaseBGraph,
  type PhaseBGraphOptions,
  type PhaseBHandoff,
} from "../index.js";

vi.mock("@/application/planning/index.js", () => ({
  prepareAssignmentPlan: vi.fn(),
}));

vi.mock("@/application/execution/index.js", () => ({
  executeCollaborativeAssignment: vi.fn(),
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
vi.mock("../features/planning/execution/execute-work-item-planning.js", () => ({
  executeWorkItemPlanning: vi.fn(),
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
  vi.mocked(executeWorkItemPlanning).mockReset();
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
    { ...options, executionCeiling: handoff.executionDelegation.grant }
  );
  expect(getApprovedDecision).toHaveBeenCalledExactlyOnceWith(
    decompositionInput.approvedDecisionId
  );
  return result;
}

it("returns the proposed result from one Application call", async () => {
  const agent = vi.fn().mockResolvedValue({ type: "propose", workItems });
  expect(await invoke({ agent })).toEqual({
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
      executionCeiling: handoff.executionDelegation.grant,
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
  expect(await invoke({ agent })).toEqual({
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
  expect(await invoke({ agent })).toEqual({
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
  expect(await invoke({ agent })).toEqual({
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
  expect(await invoke({ timeoutMs: 3210 })).toEqual({
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

const planningOptions = {
  repositoryPath: approval.snapshot.repositoryRoot,
  limits: { maxRounds: 2, maxFilesPerRequest: 2, maxTotalFiles: 2 },
};
const planningState = {
  goal: approval.context.goal,
  repository: {
    repositoryRoot: planningOptions.repositoryPath,
    repositoryName: "repo",
    fileTree: ["task.ts"],
    packageScripts: {},
  },
  inspectedFiles: [],
};
const feedback = { ...workItems[0], dependsOn: [] };
const docs = { ...feedback, id: "docs", objective: "Update documentation" };
const api = { ...feedback, id: "api", objective: "Update API behavior" };
const client = {
  ...feedback,
  id: "client",
  objective: "Integrate API",
  dependsOn: [api.id],
};

function completedPlan(id: string): PlanningResult {
  return {
    status: "completed",
    state: planningState,
    rounds: 1,
    task: {
      id: `task-${id}`,
      goalId: "goal-1",
      objective: id,
      targetRepository: "repo",
      allowedPaths: ["task.ts"],
      forbiddenPaths: [],
      constraints: [],
      acceptanceCriteria: [],
      verification: [],
    },
  };
}

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
  "preserves selection for $name and defers all planning without Claim",
  async ({ items, selected }) => {
    const agent = vi
      .fn()
      .mockResolvedValue({ type: "propose", workItems: items });
    const selectWorkItemIds = vi.fn(() => selected.map(({ id }) => id));
    const planner = vi.fn();
    const result = await createPhaseBGraph({
      agent,
      planning: {
        detailed: { ...planningOptions, planner },
        selectWorkItemIds,
      },
    }).invoke(input);
    expect(selectWorkItemIds).toHaveBeenCalledExactlyOnceWith(items);
    expect(result.workDecompositionResult).toEqual({
      ...decompositionInput,
      status: "proposed",
      workItems: items,
    });
    expect(result.deferredDetailedPlanningIds).toEqual(
      selected.map(({ id }) => id)
    );
    expect(result.detailedPlanningBlockedReason).toContain(
      "claimed Assignment Read"
    );
    expect(result.planningResults).toEqual([]);
    expect(executeWorkItemPlanning).not.toHaveBeenCalled();
    expect(planner).not.toHaveBeenCalled();
  }
);

it("validates all selected IDs before planning any Work Item", async () => {
  const agent = vi
    .fn()
    .mockResolvedValue({ type: "propose", workItems: [feedback] });
  const graph = createPhaseBGraph({
    agent,
    planning: {
      detailed: planningOptions,
      selectWorkItemIds: () => [feedback.id, "unknown"],
    },
  });
  await expect(graph.invoke(input)).rejects.toThrow(
    "Planning selection contains an unknown Work Item ID."
  );
  expect(executeWorkItemPlanning).not.toHaveBeenCalled();
});

it("defers each selected ID once", async () => {
  const agent = vi
    .fn()
    .mockResolvedValue({ type: "propose", workItems: [feedback, docs] });
  vi.mocked(executeWorkItemPlanning).mockResolvedValue(
    completedPlan(feedback.id)
  );
  const result = await createPhaseBGraph({
    agent,
    planning: {
      detailed: planningOptions,
      selectWorkItemIds: () => [feedback.id, feedback.id],
    },
  }).invoke(input);
  expect(executeWorkItemPlanning).not.toHaveBeenCalled();
  expect(result.deferredDetailedPlanningIds).toEqual([feedback.id]);
  expect(result.planningResults).toEqual([]);
});

it.each(["docs", "missing", "client"])(
  "denies direct execution for %s and leaves Detailed Planning deferred",
  async (workItemId) => {
    const items = [api, client, docs];
    vi.mocked(executeWorkItemPlanning).mockImplementation(async ({ phaseB }) =>
      completedPlan(phaseB.workItem.id)
    );
    const result = await createPhaseBGraph({
      agent: async () => ({ type: "propose", workItems: items }),
      execution: { workItem: { workItemId, readPaths: [], timeoutMs: 1000 } },
      planning: {
        detailed: planningOptions,
        selectWorkItemIds: () => items.map(({ id }) => id),
      },
    }).invoke(input);
    expect(result.planningResults).toEqual([]);
    expect(result.deferredDetailedPlanningIds).toEqual(
      items.map(({ id }) => id)
    );
    expect(executeWorkItemPlanning).not.toHaveBeenCalled();
    expect(beginValidatedWorkItemExecutionSource).not.toHaveBeenCalled();
    expect(executeWorkItem).not.toHaveBeenCalled();
    expect(result.executionPreparationResult).toMatchObject({
      workItemId,
      status: "blocked",
    });
  }
);

it("denies direct execution with no Assignment Plan or Detailed Planning", async () => {
  const result = await createPhaseBGraph({
    agent: async () => ({ type: "propose", workItems: [api] }),
    execution: {
      workItem: { workItemId: api.id, readPaths: [], timeoutMs: 1000 },
    },
  }).invoke(input);
  expect(result.executionPreparationResult).toMatchObject({
    workItemId: api.id,
    status: "blocked",
  });
  expect(executeWorkItem).not.toHaveBeenCalled();
});

it.each([
  { type: "escalate", reason: "Need clarification", questions: ["Which API?"] },
  { type: "propose", workItems: [] },
])(
  "leaves Planning untouched when decomposition is not proposed",
  async (action) => {
    const agent = vi.fn().mockResolvedValue(action);
    const selectWorkItemIds = vi.fn(() => [feedback.id]);
    const result = await createPhaseBGraph({
      agent,
      planning: { detailed: planningOptions, selectWorkItemIds },
    }).invoke(input);
    expect(result.workDecompositionResult?.status).not.toBe("proposed");
    expect(result.planningResults).toBeUndefined();
    expect(selectWorkItemIds).not.toHaveBeenCalled();
    expect(executeWorkItemPlanning).not.toHaveBeenCalled();
  }
);

it("skips Planning for an empty selection", async () => {
  const agent = vi
    .fn()
    .mockResolvedValue({ type: "propose", workItems: [feedback] });
  const result = await createPhaseBGraph({
    agent,
    planning: { detailed: planningOptions, selectWorkItemIds: () => [] },
  }).invoke(input);
  expect(executeWorkItemPlanning).not.toHaveBeenCalled();
  expect(result.selectedWorkItemIds).toEqual([]);
  expect(result.pendingPlanningIds).toBeUndefined();
  expect(result.planningResults).toEqual([]);
});

it("takes the selection and prior results only from the current Graph run", async () => {
  const agent = vi
    .fn()
    .mockResolvedValue({ type: "propose", workItems: [feedback, docs] });
  const graph = createPhaseBGraph({
    agent,
    planning: {
      detailed: planningOptions,
      selectWorkItemIds: () => [feedback.id],
    },
  });
  vi.mocked(executeWorkItemPlanning).mockResolvedValue(
    completedPlan(feedback.id)
  );
  const suppliedState = {
    ...input,
    pendingPlanningIds: [docs.id],
    planningResults: [{ workItemId: docs.id, result: completedPlan(docs.id) }],
  };
  const first = await graph.invoke(suppliedState);
  const second = await graph.invoke(input);
  expect(executeWorkItemPlanning).not.toHaveBeenCalled();
  expect(first.planningResults).toEqual([]);
  expect(first.deferredDetailedPlanningIds).toEqual([feedback.id]);
  expect(second).toEqual(first);
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
  "coordinates combined Planning when Assignment Planning is %s and execution requested is %s",
  async (status, requested) => {
    const assignmentResult =
      status === "prepared"
        ? { status, plan: combinedPlan }
        : {
            status,
            failure: "provenance" as const,
            reason: "Approval unavailable",
          };
    vi.mocked(prepareAssignmentPlan).mockResolvedValueOnce(assignmentResult);
    vi.mocked(executeWorkItemPlanning).mockResolvedValueOnce(
      completedPlan("ready")
    );
    const shouldExecute = requested && status === "prepared";
    vi.mocked(getPreparedAssignmentPlan).mockReturnValueOnce({
      plan: combinedPlan,
      workItems: combinedItems,
      specialistSources: [],
    });
    vi.mocked(executeCollaborativeAssignment).mockResolvedValueOnce({
      status: "read-completed",
      invocationId: "invocation",
      resultDigest: "digest",
    });
    const selectWorkItemIds = vi.fn(() => combinedItems.map(({ id }) => id));
    const agent = vi.fn();
    const result = await createPhaseBGraph({
      agent: async () => ({ type: "propose", workItems: combinedItems }),
      execution: {
        workItem: { workItemId: "ready", readPaths: [], timeoutMs: 1000 },
        ...(requested && {
          assignment: {
            contexts: {
              ready: {
                readScopes: [{ kind: "file", path: "README.md" }],
                timeoutMs: 1000,
              },
            },
          },
        }),
      },
      planning: {
        assignment: { agent },
        detailed: planningOptions,
        selectWorkItemIds,
      },
    }).invoke(input);

    expect(selectWorkItemIds).toHaveBeenCalledOnce();
    expect(result.selectedWorkItemIds).toEqual([
      "ready",
      "awaiting",
      "analysis",
      "without-worker",
    ]);
    expect(prepareAssignmentPlan).toHaveBeenCalledExactlyOnceWith(
      handoff,
      result.workDecompositionResult,
      result.selectedWorkItemIds,
      agent
    );
    expect(result.assignmentPlanResult).toEqual(assignmentResult);
    expect(beginValidatedWorkItemExecutionSource).not.toHaveBeenCalled();
    expect(executeWorkItem).not.toHaveBeenCalled();
    expect(executeWorkItemPlanning).not.toHaveBeenCalled();
    expect(getPreparedAssignmentPlan).toHaveBeenCalledTimes(
      shouldExecute ? 1 : 0
    );
    expect(executeCollaborativeAssignment).toHaveBeenCalledTimes(
      shouldExecute ? 1 : 0
    );
    if (shouldExecute) {
      expect(result.assignmentExecutionResult).toMatchObject({
        status: "pending",
        results: [{ assignmentId: "ready", status: "read-completed" }],
      });
    } else {
      expect(result.assignmentExecutionResult).toBeUndefined();
    }
    expect(result.pendingPlanningIds).toBeUndefined();
    expect(result.planningResults).toEqual([]);
    if (status === "prepared") {
      expect(result.executionPreparationResult).toMatchObject({
        status: "blocked",
        workItemId: "ready",
      });
      expect(result.deferredDetailedPlanningIds).toEqual([
        "ready",
        "awaiting",
        "analysis",
        "without-worker",
      ]);
    } else {
      expect(result.executionPreparationResult).toBeUndefined();
    }
  }
);
