import { expect, it, vi } from "vitest";
import { executeAssignment } from "@/application/specialist/execution/index.js";
import { getPreparedAssignmentPlan } from "@/application/governance/index.js";
import type { PhaseBAssignment } from "@/contracts/assignment/phase-b-assignment.js";
import { coordinateAssignmentExecutions } from "./coordinate-assignment-executions.js";

vi.mock("@/application/specialist/execution/index.js", () => ({
  executeAssignment: vi.fn(),
}));
vi.mock("@/application/governance/index.js", () => ({
  getPreparedAssignmentPlan: vi.fn(),
  getAssignmentExecutionResults: () => [],
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
  >
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
        ([id, workItemId, dependsOn = [], ceiling]): PhaseBAssignment => ({
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
    workItemResults: [
      { workItemId: "A", status: "failed" },
      { workItemId: "B", status: "pending" },
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
