import { expect, it, vi } from "vitest";
import { executeCollaborativeAssignment } from "@/application/execution/index.js";
import { getPreparedAssignmentPlan } from "@/application/governance/index.js";
import type { PhaseBAssignment } from "@/contracts/phase-b-assignment.js";
import { executeAssignmentPlan } from "./execute-assignment-plan.js";

vi.mock("@/application/execution/index.js", () => ({
  executeCollaborativeAssignment: vi.fn(),
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
    [id: string, workItemId: string, dependsOn?: string[], kind?: "worker"]
  >
) {
  const subject = {
    plan: {
      assignments: assignments.map(
        ([id, workItemId, dependsOn = [], kind]): PhaseBAssignment => ({
          id,
          workItemId,
          dependsOn,
          objective: id,
          deliverable: id,
          executor:
            kind === "worker"
              ? { kind, mode: "codex-worktree" }
              : { kind: "specialist", specialistId: "approved" },
        })
      ),
    },
    workItems: Object.entries(dependencies).map(([id, dependsOn]) => ({
      id,
      dependsOn,
      objective: id,
      deliverable: id,
      workType: assignments.some(
        ([, workItemId, , kind]) => workItemId === id && kind === "worker"
      )
        ? "repository-modification"
        : "read-only",
    })),
  };
  vi.mocked(getPreparedAssignmentPlan).mockReturnValue(
    subject as ReturnType<typeof getPreparedAssignmentPlan>
  );
  const gates = new Map(
    assignments.map(([id]) => [
      id,
      deferred<Awaited<ReturnType<typeof executeCollaborativeAssignment>>>(),
    ])
  );
  const started: string[] = [];
  vi.mocked(executeCollaborativeAssignment).mockImplementation(
    async (_, { assignmentId }) => {
      started.push(assignmentId);
      return gates.get(assignmentId)!.promise;
    }
  );
  return {
    started,
    run: (
      contexts: string[],
      planning?: Parameters<typeof executeAssignmentPlan>[4]
    ) =>
      executeAssignmentPlan(
        {} as Parameters<typeof executeAssignmentPlan>[0],
        "plan",
        Object.keys(dependencies),
        {
          maxConcurrentRuns: 2,
          contexts: Object.fromEntries(
            contexts.map((id) => [
              id,
              { readPaths: ["README.md"], timeoutMs: 1000 },
            ])
          ),
        },
        planning
      ),
    complete: (id: string) =>
      gates
        .get(id)!
        .resolve({ status: "completed", invocationId: id, resultDigest: id }),
    fail: (id: string) =>
      gates.get(id)!.resolve({
        status: "failed",
        failure: "execution",
        invocationId: id,
        failureRecorded: true,
      }),
  };
}

it("fills slots as each result arrives and waits for every dependency", async () => {
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
  await vi.waitFor(() => expect(started.at(-1)).toBe("a3"));
  complete("a3");
  await vi.waitFor(() => expect(started.at(-1)).toBe("c"));
  complete("c");
  complete("b");
  await vi.waitFor(() => expect(started.at(-1)).toBe("d"));
  complete("d");
  expect(await result).toMatchObject({ status: "completed" });
  const outcome = await result;
  if (outcome.failure === "plan") throw new Error("Plan rejected");
  expect(outcome.results.map(({ assignmentId }) => assignmentId)).toEqual([
    "a2",
    "a1",
    "a3",
    "c",
    "b",
    "d",
  ]);
});

it("shares capacity with draft planning and continues independent execution after failure", async () => {
  const fixtureRun = fixture({ A: [], B: [], C: ["A"] }, [
    ["a", "A"],
    ["b", "B", [], "worker"],
    ["c", "C"],
  ]);
  const draft = deferred<boolean>();
  const plan = vi.fn(() => draft.promise);
  const result = fixtureRun.run(["a", "c"], { run: plan });
  expect(fixtureRun.started).toEqual(["a"]);
  expect(plan).toHaveBeenCalledExactlyOnceWith("B", "b");
  fixtureRun.fail("a");
  draft.resolve(true);
  expect(await result).toMatchObject({
    status: "failed",
    pendingAssignments: [{ assignmentId: "b" }, { assignmentId: "c" }],
  });
});

it("starts independent drafts together and retains failures arriving out of order", async () => {
  const fixtureRun = fixture({ A: [], B: [] }, [
    ["a", "A", [], "worker"],
    ["b", "B", [], "worker"],
  ]);
  const a = deferred<boolean>();
  const b = deferred<boolean>();
  const plan = vi.fn((id: string) => (id === "A" ? a.promise : b.promise));
  const result = fixtureRun.run([], { run: plan });
  expect(plan.mock.calls).toEqual([
    ["A", "a"],
    ["B", "b"],
  ]);
  b.resolve(false);
  a.resolve(true);
  expect(await result).toMatchObject({ failedPlanningWorkItemIds: ["B"] });
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
      { workItemId: "B", status: "completed" },
      { workItemId: "C", status: "pending" },
    ],
  });
  expect(fixtureRun.started).toEqual(["a", "b"]);
});
