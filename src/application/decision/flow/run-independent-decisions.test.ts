import { beforeEach, describe, expect, it, vi } from "vitest";

import type { GoalSpec } from "@/contracts/goal.js";

import type { RepositorySnapshot } from "../model/snapshot.js";
import type { AgentDecision } from "../protocol/decision.js";
import { runCodexSpecialist } from "../specialist/codex-specialist.js";
import { assertRepositoryMatchesSnapshot } from "./repository-snapshot.js";
import {
  runIndependentDecisions,
  type IndependentDecisionInput,
} from "./run-independent-decisions.js";

vi.mock("../specialist/codex-specialist.js", () => ({ runCodexSpecialist: vi.fn() }));
vi.mock("./repository-snapshot.js", () => ({ assertRepositoryMatchesSnapshot: vi.fn() }));

const runSpecialistMock = vi.mocked(runCodexSpecialist);
const assertSnapshotMock = vi.mocked(assertRepositoryMatchesSnapshot);
const snapshot: RepositorySnapshot = { repositoryRoot: "/repositories/example", commitSha: "abc123" };
const goal: GoalSpec = { objective: "Evaluate this UI change", targetRepository: "example" };
const inputs: IndependentDecisionInput[] = [
  {
    specialist: {
      id: "frontend", role: "Frontend Specialist", objective: "Review implementation",
      authority: { repositoryAccess: "read", shellExecution: false },
    },
    files: [{ path: "src/interface.ts", content: "// Implementation" }],
  },
  {
    specialist: {
      id: "ux", role: "UX Specialist", objective: "Review interaction",
      authority: { repositoryAccess: "read", shellExecution: false },
    },
    files: [{ path: "docs/interaction.md", content: "Interaction specification" }],
  },
];
const decisions: AgentDecision[] = inputs.map(({ specialist }) => ({
  specialistId: specialist.id,
  recommendation: `Independent recommendation from ${specialist.id}`,
  evidence: [], risks: [], uncertainty: [],
}));

beforeEach(() => {
  assertSnapshotMock.mockReset();
  runSpecialistMock.mockReset();
  runSpecialistMock.mockResolvedValueOnce(decisions[0]).mockResolvedValueOnce(decisions[1]);
});

describe("runIndependentDecisions", () => {
  it("awaits each Specialist before starting the next and returns decisions in input order", async () => {
    let finishFirst!: (decision: AgentDecision) => void;
    runSpecialistMock.mockReset();
    runSpecialistMock.mockImplementationOnce(() => new Promise((resolve) => { finishFirst = resolve; }));
    runSpecialistMock.mockResolvedValueOnce(decisions[1]);

    const result = runIndependentDecisions(snapshot, goal, inputs);
    expect(runSpecialistMock).toHaveBeenCalledTimes(1);
    expect(runSpecialistMock.mock.calls[0][0]).toBe(inputs[0].specialist);
    expect(assertSnapshotMock).toHaveBeenCalledTimes(1);
    finishFirst(decisions[0]);

    await expect(result).resolves.toEqual(decisions);
    expect(runSpecialistMock).toHaveBeenCalledTimes(2);
    expect(runSpecialistMock.mock.calls[1][0]).toBe(inputs[1].specialist);
  });

  it("creates separate Contexts with the shared Goal / commit and each Specialist's own files only", async () => {
    const before = structuredClone({ snapshot, goal, inputs });
    await runIndependentDecisions(snapshot, goal, inputs);

    const contexts = runSpecialistMock.mock.calls.map((call) => call[1]);
    expect(contexts[0]).not.toBe(contexts[1]);
    for (const [index, context] of contexts.entries()) {
      expect(context).toEqual({ goal, repositoryCommitSha: snapshot.commitSha, files: inputs[index].files });
      expect(context.goal).toBe(goal);
      expect(context.files).toBe(inputs[index].files);
      expect(context).not.toHaveProperty("repositoryRoot");
      expect(JSON.stringify(context)).not.toContain(decisions[0].recommendation);
      expect(JSON.stringify(context)).not.toContain(decisions[1].recommendation);
    }
    expect({ snapshot, goal, inputs }).toEqual(before);
  });

  it("validates Snapshot before and after every Specialist", async () => {
    const events: string[] = [];
    assertSnapshotMock.mockImplementation(() => { events.push("assert"); });
    runSpecialistMock.mockReset();
    runSpecialistMock.mockImplementation(async (specialist) => {
      events.push(specialist.id);
      return decisions.find((decision) => decision.specialistId === specialist.id)!;
    });

    await runIndependentDecisions(snapshot, goal, inputs);

    expect(events).toEqual(["assert", "frontend", "assert", "assert", "ux", "assert"]);
    expect(assertSnapshotMock).toHaveBeenCalledTimes(4);
    for (const [actualSnapshot] of assertSnapshotMock.mock.calls) expect(actualSnapshot).toBe(snapshot);
  });

  it("rejects duplicate IDs before any Specialist or Snapshot validation", async () => {
    const duplicate = { ...inputs[1], specialist: { ...inputs[1].specialist, id: inputs[0].specialist.id } };
    await expect(runIndependentDecisions(snapshot, goal, [inputs[0], inputs[1], duplicate])).rejects.toThrow(
      "Duplicate Specialist ID: frontend.",
    );
    expect(runSpecialistMock).not.toHaveBeenCalled();
    expect(assertSnapshotMock).not.toHaveBeenCalled();
  });

  it("does not start any Specialist when the initial Snapshot check fails", async () => {
    const error = new Error("Repository HEAD changed");
    assertSnapshotMock.mockImplementationOnce(() => { throw error; });

    await expect(runIndependentDecisions(snapshot, goal, inputs)).rejects.toBe(error);
    expect(runSpecialistMock).not.toHaveBeenCalled();
  });

  it("rejects without partial results or later execution on post-run Snapshot drift", async () => {
    const error = new Error("Repository working tree became dirty");
    assertSnapshotMock.mockImplementationOnce(() => {}).mockImplementationOnce(() => { throw error; });

    await expect(runIndependentDecisions(snapshot, goal, inputs)).rejects.toBe(error);
    expect(runSpecialistMock).toHaveBeenCalledTimes(1);
    expect(assertSnapshotMock).toHaveBeenCalledTimes(2);
  });

  it("stops before the next Specialist if its pre-run Snapshot check fails", async () => {
    const error = new Error("Repository HEAD changed");
    assertSnapshotMock.mockImplementationOnce(() => {}).mockImplementationOnce(() => {})
      .mockImplementationOnce(() => { throw error; });

    await expect(runIndependentDecisions(snapshot, goal, inputs)).rejects.toBe(error);
    expect(runSpecialistMock).toHaveBeenCalledTimes(1);
    expect(assertSnapshotMock).toHaveBeenCalledTimes(3);
  });

  it("does not return accumulated decisions if the last post-run check fails", async () => {
    const error = new Error("Repository HEAD changed");
    assertSnapshotMock.mockImplementationOnce(() => {}).mockImplementationOnce(() => {})
      .mockImplementationOnce(() => {}).mockImplementationOnce(() => { throw error; });

    await expect(runIndependentDecisions(snapshot, goal, inputs)).rejects.toBe(error);
    expect(runSpecialistMock).toHaveBeenCalledTimes(2);
  });

  it("stops immediately on Specialist failure without running the next Specialist", async () => {
    const error = new Error("Codex specialist failed");
    runSpecialistMock.mockReset();
    runSpecialistMock.mockRejectedValueOnce(error);

    await expect(runIndependentDecisions(snapshot, goal, inputs)).rejects.toBe(error);
    expect(runSpecialistMock).toHaveBeenCalledTimes(1);
  });

  it("rejects the whole flow if a later Specialist fails after an earlier success", async () => {
    const error = new Error("UX specialist failed");
    runSpecialistMock.mockReset();
    runSpecialistMock.mockResolvedValueOnce(decisions[0]).mockRejectedValueOnce(error);

    await expect(runIndependentDecisions(snapshot, goal, inputs)).rejects.toBe(error);
    expect(runSpecialistMock).toHaveBeenCalledTimes(2);
  });

  it("passes the provided options to every runtime invocation", async () => {
    const options = { timeoutMs: 1234 };
    await runIndependentDecisions(snapshot, goal, inputs, options);
    for (const call of runSpecialistMock.mock.calls) expect(call[2]).toBe(options);
  });

  it("uses empty default options", async () => {
    await runIndependentDecisions(snapshot, goal, inputs);
    for (const call of runSpecialistMock.mock.calls) expect(call[2]).toEqual({});
  });

  it("returns an empty array without execution when no Specialists are supplied", async () => {
    await expect(runIndependentDecisions(snapshot, goal, [])).resolves.toEqual([]);
    expect(runSpecialistMock).not.toHaveBeenCalled();
    expect(assertSnapshotMock).not.toHaveBeenCalled();
  });
});
