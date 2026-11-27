import { expect, it, vi } from "vitest";
import { executeAssignment } from "@/application/specialist/execution/index.js";
import {
  getAssignmentExecutionResults,
  getPreparedAssignmentPlan,
} from "@/application/governance/index.js";
import type { ExecutionAssignment } from "@/contracts/management/execution-assignment.js";
import { coordinateAssignmentExecutions } from "./coordinate-assignment-executions.js";

vi.mock("@/application/specialist/execution/index.js", () => ({
  executeAssignment: vi.fn(),
}));
vi.mock("@/application/governance/index.js", () => ({
  getPreparedAssignmentPlan: vi.fn(),
  getAssignmentExecutionResults: vi.fn(),
}));

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((complete) => {
    resolve = complete;
  });
  return { promise, resolve };
}

function fixture(
  dependencies: Record<string, string[]>,
  assignments: Array<
    [id: string, workItemId: string, dependsOn?: string[], ceiling?: "write"]
  >,
  recorded: ReturnType<typeof getAssignmentExecutionResults> = []
) {
  const subject = {
    specialistSources: [],
    plan: {
      id: "plan",
      decompositionBinding: "decomposition",
      staffingBinding: "staffing",
      snapshot: { repositoryRoot: "/repo", commitSha: "sha" },
      selectedWorkItemIds: Object.keys(dependencies),
      assignments: assignments.map(
        ([id, workItemId, dependsOn = [], ceiling]): ExecutionAssignment => ({
          id,
          workItemId,
          dependsOn,
          objective: id,
          deliverable: id,
          specialistId: "approved",
          repositoryAccessCeiling: ceiling ?? "read",
        })
      ),
    },
    workItems: Object.entries(dependencies).map(([id, dependsOn]) => ({
      id,
      dependsOn,
      objective: id,
      deliverable: id,
    })),
  };
  vi.mocked(getPreparedAssignmentPlan).mockReturnValue(
    subject as ReturnType<typeof getPreparedAssignmentPlan>
  );
  vi.mocked(getAssignmentExecutionResults).mockReturnValue(recorded);
  const gates = new Map(
    assignments.map(([id]) => [
      id,
      deferred<Awaited<ReturnType<typeof executeAssignment>>>(),
    ])
  );
  const started: string[] = [];
  vi.mocked(executeAssignment).mockImplementation(
    async ({ request: { assignmentId } }) => {
      started.push(assignmentId);
      return gates.get(assignmentId)!.promise;
    }
  );
  return {
    started,
    plan: subject.plan,
    run: (contexts: string[], plan = subject.plan) =>
      coordinateAssignmentExecutions(
        {
          handoff: {} as Parameters<
            typeof coordinateAssignmentExecutions
          >[0]["handoff"],
          plan,
          selectedWorkItemIds: Object.keys(dependencies),
        },
        {
          maxConcurrentRuns: 2,
          contexts: Object.fromEntries(
            contexts.map((id) => [
              id,
              {
                readScopes: [{ kind: "file", path: "README.md" }],
                timeoutMs: 1000,
              },
            ])
          ),
        }
      ),
    complete: (id: string) =>
      gates.get(id)!.resolve({
        status: "read-completed",
        invocationId: id,
        resultDigest: id,
      }),
    finish: (
      id: string,
      result: Awaited<ReturnType<typeof executeAssignment>>
    ) => gates.get(id)!.resolve(result),
    fail: (id: string) =>
      gates.get(id)!.resolve({
        status: "failed",
        failure: "execution",
        invocationId: id,
        failureRecorded: true,
      }),
  };
}

it("fills slots when Assignment results arrive and holds dependent Work Items", async () => {
  const fixtureRun = fixture({ A: [], B: [], C: ["A"], D: ["A", "B"] }, [
    ["a1", "A"],
    ["a2", "A"],
    ["a3", "A", ["a1", "a2"]],
    ["b", "B"],
    ["c", "C"],
    ["d", "D"],
  ]);
  const { started, complete } = fixtureRun;
  const result = fixtureRun.run(["a1", "a2", "a3", "b", "c", "d"]);
  expect(started).toEqual(["a1", "a2"]);
  complete("a2");
  await vi.waitFor(() => expect(started).toEqual(["a1", "a2", "b"]));
  complete("a1");
  complete("b");
  expect(await result).toMatchObject({ status: "pending" });
  const outcome = await result;
  if ("failure" in outcome) throw new Error("Plan rejected");
  expect(
    outcome.pendingAssignments.map(({ assignmentId }) => assignmentId)
  ).toEqual(["a3", "c", "d"]);
  expect(outcome.results.map(({ assignmentId }) => assignmentId)).toEqual([
    "a2",
    "a1",
    "b",
  ]);
});

it("runs both access ceilings but leaves dependent and unconfigured Assignments pending", async () => {
  const { run, started, complete } = fixture({ A: [], B: [], C: ["A"] }, [
    ["a", "A"],
    ["b", "B", [], "write"],
    ["missing", "B"],
    ["c", "C"],
  ]);
  const result = run(["a", "b", "c"]);
  expect(started).toEqual(["a", "b"]);
  complete("b");
  complete("a");
  expect(await result).toMatchObject({
    status: "pending",
    results: expect.arrayContaining([
      expect.objectContaining({ assignmentId: "b", status: "read-completed" }),
      expect.objectContaining({ assignmentId: "a", status: "read-completed" }),
    ]),
    pendingAssignments: [
      { assignmentId: "missing", reason: "context-required" },
      { assignmentId: "c", reason: "dependency-pending" },
    ],
  });
});

it("keeps an independent execution running when a predecessor fails", async () => {
  const fixtureRun = fixture({ A: [], B: [], C: ["A"] }, [
    ["a", "A"],
    ["b", "B"],
    ["c", "C"],
  ]);
  const result = fixtureRun.run(["a", "b", "c"]);
  expect(fixtureRun.started).toEqual(["a", "b"]);
  fixtureRun.fail("a");
  fixtureRun.complete("b");
  expect(await result).toMatchObject({
    workItemExecutionStatuses: [
      { workItemId: "A", status: "failed" },
      { workItemId: "B", status: "execution-completed" },
      { workItemId: "C", status: "pending" },
    ],
  });
  expect(fixtureRun.started).toEqual(["a", "b"]);
});

it("rejects a changed Plan payload even when its ID is registered", async () => {
  const { plan, run, started } = fixture({ A: [] }, [["a", "A"]]);
  const forged = {
    ...plan,
    assignments: plan.assignments.map((assignment) => ({
      ...assignment,
      objective: "Forged",
    })),
  };
  await expect(run(["a"], forged)).resolves.toMatchObject({
    status: "denied",
    failure: "plan",
  });
  expect(started).toEqual([]);
});

it("completes all selected Work Items with matching read and write results", async () => {
  const { run, complete, finish } = fixture({ A: [], B: [] }, [
    ["review", "A"],
    ["design", "A"],
    ["implement", "B", [], "write"],
  ]);
  const result = run(["review", "design", "implement"]);
  complete("review");
  complete("design");
  finish("implement", {
    status: "write-completed",
    assignmentId: "implement",
    workItemId: "B",
    specialistId: "approved",
    invocationId: "write",
    resultDigest: "result",
    taskContractBinding: "binding",
    artifacts: { directory: "/run", resultDigest: "artifact" },
  });
  await expect(result).resolves.toMatchObject({
    planId: "plan",
    status: "execution-completed",
    workItemExecutionStatuses: [
      { workItemId: "A", status: "execution-completed" },
      { workItemId: "B", status: "execution-completed" },
    ],
    pendingAssignments: [],
  });
});

it("requires the correct result for every registered Assignment", async () => {
  const { run, started } = fixture(
    { A: [], B: ["A"], C: [], D: [] },
    [
      ["write", "A", [], "write"],
      ["prepared", "B", [], "write"],
      ["required", "C"],
      ["unconfigured", "D"],
    ],
    [
      {
        status: "read-completed",
        assignmentId: "write",
        workItemId: "A",
        invocationId: "old",
        resultDigest: "old",
      },
      {
        status: "task-prepared",
        assignmentId: "prepared",
        workItemId: "B",
        invocationId: "prepare",
        resultDigest: "draft",
        planFormat: "structured",
        taskContractBinding: "binding",
      },
      {
        status: "read-completed",
        assignmentId: "unknown",
        workItemId: "C",
        invocationId: "other",
        resultDigest: "other",
      },
    ]
  );
  await expect(run(["prepared"])).resolves.toMatchObject({
    status: "pending",
    results: expect.arrayContaining([
      expect.objectContaining({
        assignmentId: "prepared",
        status: "task-prepared",
      }),
    ]),
    pendingAssignments: expect.arrayContaining([
      {
        assignmentId: "prepared",
        workItemId: "B",
        reason: "dependency-pending",
      },
    ]),
    workItemExecutionStatuses: [
      { workItemId: "A", status: "pending" },
      { workItemId: "B", status: "pending" },
      { workItemId: "C", status: "pending" },
      { workItemId: "D", status: "pending" },
    ],
  });
  expect(started).toEqual([]);
});

it("reuses completed results and skips already reserved Assignments", async () => {
  const recorded = [
    {
      status: "read-completed",
      assignmentId: "done",
      workItemId: "A",
      invocationId: "read",
      resultDigest: "digest",
    },
    {
      status: "denied",
      failure: "duplicate",
      assignmentId: "reserved",
      workItemId: "B",
      invocationId: "reservation",
    },
  ] as const;
  const { run, started } = fixture(
    { A: [], B: [] },
    [
      ["done", "A"],
      ["reserved", "B"],
    ],
    [...recorded]
  );
  await expect(run(["done", "reserved"])).resolves.toMatchObject({
    status: "denied",
    results: recorded,
    workItemExecutionStatuses: [
      { workItemId: "A", status: "execution-completed" },
      { workItemId: "B", status: "denied" },
    ],
  });
  expect(started).toEqual([]);
});
