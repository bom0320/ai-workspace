import { beforeEach, expect, it, vi } from "vitest";
import type { PlanningResult } from "@/application/planning/index.js";
import { getApprovedDecision } from "@/application/governance/index.js";
import { runWorkDecomposition } from "@/application/work-decomposition/index.js";
import { runCommand } from "@/infrastructure/process/index.js";
import { planWorkItem } from "../features/planning/execution/plan-work-item.js";
import { createPhaseBGraph, type PhaseBGraphOptions } from "../index.js";

vi.mock("@/application/governance/index.js", () => ({
  getApprovedDecision: vi.fn(),
}));
vi.mock("../features/planning/execution/plan-work-item.js", () => ({
  planWorkItem: vi.fn(),
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
  },
];

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(planWorkItem).mockReset();
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
  "plans explicitly selected items for $name in selection order",
  async ({ items, selected }) => {
    const agent = vi
      .fn()
      .mockResolvedValue({ type: "propose", workItems: items });
    const selectWorkItemIds = vi.fn(() => selected.map(({ id }) => id));
    const planner = vi.fn();
    vi.mocked(planWorkItem).mockImplementation(async ({ phaseB }) =>
      completedPlan(phaseB.workItem.id)
    );

    const result = await createPhaseBGraph({
      agent,
      planning: { ...planningOptions, selectWorkItemIds, planner },
    }).invoke(input);

    expect(selectWorkItemIds).toHaveBeenCalledExactlyOnceWith(items);
    expect(vi.mocked(planWorkItem).mock.calls).toEqual(
      selected.map((workItem) => [
        {
          ...planningOptions,
          planner,
          phaseB: { ...input, workItem },
        },
      ])
    );
    expect(result.workDecompositionResult).toEqual({
      ...input,
      status: "proposed",
      workItems: items,
    });
    expect(result.planningResults).toEqual(
      selected.map(({ id }) => ({
        workItemId: id,
        result: completedPlan(id),
      }))
    );
    expect(result.pendingPlanningIds).toEqual([]);
  }
);

it("validates all selected IDs before planning any Work Item", async () => {
  const agent = vi
    .fn()
    .mockResolvedValue({ type: "propose", workItems: [feedback] });
  const graph = createPhaseBGraph({
    agent,
    planning: {
      ...planningOptions,
      selectWorkItemIds: () => [feedback.id, "unknown"],
    },
  });
  await expect(graph.invoke(input)).rejects.toThrow(
    "Planning selection contains an unknown Work Item ID."
  );
  expect(planWorkItem).not.toHaveBeenCalled();
});

it("plans each selected ID once", async () => {
  const agent = vi
    .fn()
    .mockResolvedValue({ type: "propose", workItems: [feedback, docs] });
  vi.mocked(planWorkItem).mockResolvedValue(completedPlan(feedback.id));
  const result = await createPhaseBGraph({
    agent,
    planning: {
      ...planningOptions,
      selectWorkItemIds: () => [feedback.id, feedback.id],
    },
  }).invoke(input);
  expect(planWorkItem).toHaveBeenCalledOnce();
  expect(result.planningResults?.map(({ workItemId }) => workItemId)).toEqual([
    feedback.id,
  ]);
});

it("keeps prior results and stops at the first failed PlanningResult", async () => {
  const agent = vi
    .fn()
    .mockResolvedValue({ type: "propose", workItems: [api, client, docs] });
  const failed = {
    status: "failed",
    reason: "Planning round limit reached.",
    rounds: 2,
    state: planningState,
  } satisfies PlanningResult;
  vi.mocked(planWorkItem)
    .mockResolvedValueOnce(completedPlan(api.id))
    .mockResolvedValueOnce(failed);
  const result = await createPhaseBGraph({
    agent,
    planning: {
      ...planningOptions,
      selectWorkItemIds: () => [api.id, client.id, docs.id],
    },
  }).invoke(input);
  expect(planWorkItem).toHaveBeenCalledTimes(2);
  expect(result.planningResults).toEqual([
    { workItemId: api.id, result: completedPlan(api.id) },
    { workItemId: client.id, result: failed },
  ]);
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
      planning: { ...planningOptions, selectWorkItemIds },
    }).invoke(input);
    expect(result.workDecompositionResult?.status).not.toBe("proposed");
    expect(result.planningResults).toBeUndefined();
    expect(selectWorkItemIds).not.toHaveBeenCalled();
    expect(planWorkItem).not.toHaveBeenCalled();
  }
);

it("skips Planning for an empty selection", async () => {
  const agent = vi
    .fn()
    .mockResolvedValue({ type: "propose", workItems: [feedback] });
  const result = await createPhaseBGraph({
    agent,
    planning: { ...planningOptions, selectWorkItemIds: () => [] },
  }).invoke(input);
  expect(planWorkItem).not.toHaveBeenCalled();
  expect(result.planningResults).toEqual([]);
});

it("takes the selection and prior results only from the current Graph run", async () => {
  const agent = vi
    .fn()
    .mockResolvedValue({ type: "propose", workItems: [feedback, docs] });
  const graph = createPhaseBGraph({
    agent,
    planning: { ...planningOptions, selectWorkItemIds: () => [feedback.id] },
  });
  vi.mocked(planWorkItem).mockResolvedValue(completedPlan(feedback.id));
  const suppliedState = {
    ...input,
    pendingPlanningIds: [docs.id],
    planningResults: [{ workItemId: docs.id, result: completedPlan(docs.id) }],
  };
  const first = await graph.invoke(suppliedState);
  const second = await graph.invoke(input);
  expect(planWorkItem).toHaveBeenCalledTimes(2);
  expect(first.planningResults).toEqual([
    { workItemId: feedback.id, result: completedPlan(feedback.id) },
  ]);
  expect(second).toEqual(first);
});
