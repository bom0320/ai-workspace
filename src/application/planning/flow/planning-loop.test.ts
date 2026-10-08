import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, sep } from "node:path";

import { afterEach, describe, expect, it, vi } from "vitest";

import type { TaskContractDraft } from "../model/task-draft.js";

import type { PlanningLimits } from "../model/limits.js";
import type { PlanningState } from "../model/state.js";
import * as inspection from "./inspect-files.js";
import * as finalization from "./finalize-task-contract.js";
import { runPlanningLoop, type Planner } from "./planning-loop.js";

const temporaryDirectories: string[] = [];
const limits: PlanningLimits = { maxRounds: 3, maxFilesPerRequest: 3, maxTotalFiles: 3 };
const task: TaskContractDraft = {
  objective: "Implement the goal",
  targetRepository: "example",
  allowedPaths: ["a.ts"],
  forbiddenPaths: [],
  constraints: [],
  acceptanceCriteria: ["The goal is implemented"],
  verification: ["pnpm test"],
};

function createState(): PlanningState {
  const root = mkdtempSync(join(tmpdir(), "ai-workspace-planning-loop-"));
  temporaryDirectories.push(root);
  writeFileSync(join(root, "a.ts"), "A 내용");
  writeFileSync(join(root, "b.ts"), "B");
  return {
    goal: { objective: "Implement the goal", targetRepository: "example" },
    repository: {
      repositoryRoot: root,
      repositoryName: "example",
      fileTree: ["a.ts", "b.ts"],
      packageScripts: {},
    },
    inspectedFiles: [],
  };
}

afterEach(() => {
  vi.restoreAllMocks();
  for (const directory of temporaryDirectories.splice(0)) {
    rmSync(directory, { recursive: true });
  }
});

describe("runPlanningLoop", () => {
  it("finalizes Drafts with Harness identifiers, Human constraints, and the Goal repository", async () => {
    const initialState = createState();
    initialState.goal.constraints = ["No new dependencies"];
    const planner = vi.fn<Planner>().mockResolvedValue({
      type: "complete", task: { ...task, targetRepository: "ai-other", constraints: ["Keep edits scoped"] },
    });
    const result = await runPlanningLoop({
      initialState, planner, limits, goalId: "goal-harness", taskId: "task-harness",
    });
    expect(result).toMatchObject({ status: "completed", task: {
      id: "task-harness", goalId: "goal-harness", targetRepository: "example",
      constraints: ["No new dependencies", "Keep edits scoped"],
    } });
  });

  it("propagates unexpected finalization errors", async () => {
    const error = new Error("Unexpected finalization error");
    vi.spyOn(finalization, "finalizeTaskContract").mockImplementation(() => { throw error; });
    const planner = vi.fn<Planner>().mockResolvedValue({ type: "complete", task });
    await expect(runPlanningLoop({ initialState: createState(), planner, limits, goalId: "goal-harness", taskId: "task-harness" }))
      .rejects.toBe(error);
  });

  it("returns workflow failure for invalid Harness identifiers", async () => {
    const planner = vi.fn<Planner>().mockResolvedValue({ type: "complete", task });
    const result = await runPlanningLoop({ initialState: createState(), planner, limits, goalId: "", taskId: "task-harness" });
    expect(result).toMatchObject({ status: "failed", rounds: 1,
      reason: "Planner returned a task draft that could not be finalized.",
    });
  });
  it("completes on the first decision after validating the task", async () => {
    const initialState = createState();
    const planner = vi.fn<Planner>().mockResolvedValue({ type: "complete", task });
    const result = await runPlanningLoop({ goalId: "goal-harness", taskId: "task-harness", initialState, planner, limits });

    expect(result).toEqual({ status: "completed", task: { ...task, id: "task-harness", goalId: "goal-harness" }, state: initialState, rounds: 1 });
    expect(planner).toHaveBeenCalledOnce();
    expect(planner).toHaveBeenCalledWith(initialState);
    if (result.status === "completed") {
      expect(result.task).not.toBe(task);
    }
  });

  it("inspects then completes with accumulated context without mutating initial state", async () => {
    const initialState = createState();
    const original = structuredClone(initialState);
    const originalFiles = initialState.inspectedFiles;
    const planner = vi.fn<Planner>()
      .mockResolvedValueOnce({ type: "inspect", request: { paths: ["a.ts"] } })
      .mockResolvedValueOnce({ type: "complete", task });

    const result = await runPlanningLoop({ goalId: "goal-harness", taskId: "task-harness", initialState, planner, limits });

    expect(result).toEqual({
      status: "completed", task: { ...task, id: "task-harness", goalId: "goal-harness" }, rounds: 2,
      state: { ...initialState, inspectedFiles: [{ path: "a.ts", content: "A 내용" }] },
    });
    expect(planner.mock.calls[1][0].inspectedFiles).toEqual([{ path: "a.ts", content: "A 내용" }]);
    expect(planner.mock.calls[1][0]).not.toBe(initialState);
    expect(planner.mock.calls[1][0].inspectedFiles).not.toBe(originalFiles);
    expect(initialState).toEqual(original);
    expect(initialState.inspectedFiles).toBe(originalFiles);
  });

  it("accumulates multiple rounds and sends only unread files to inspectFiles", async () => {
    const initialState = createState();
    const inspect = vi.spyOn(inspection, "inspectFiles");
    const planner = vi.fn<Planner>()
      .mockResolvedValueOnce({ type: "inspect", request: { paths: ["a.ts"] } })
      .mockResolvedValueOnce({ type: "inspect", request: { paths: ["a.ts", "b.ts", "b.ts"] } })
      .mockResolvedValueOnce({ type: "complete", task });

    const result = await runPlanningLoop({ goalId: "goal-harness", taskId: "task-harness", initialState, planner, limits });

    expect(result.status).toBe("completed");
    expect(result.rounds).toBe(3);
    expect(inspect).toHaveBeenCalledTimes(2);
    expect(inspect).toHaveBeenNthCalledWith(1, initialState.repository.repositoryRoot, { paths: ["a.ts"] });
    expect(inspect).toHaveBeenNthCalledWith(2, initialState.repository.repositoryRoot, { paths: ["b.ts"] });
    expect(planner.mock.calls[1][0].inspectedFiles).toEqual([{ path: "a.ts", content: "A 내용" }]);
    expect(planner.mock.calls[2][0].inspectedFiles).toEqual([
      { path: "a.ts", content: "A 내용" }, { path: "b.ts", content: "B" },
    ]);
    expect(planner.mock.calls[1][0].inspectedFiles).toHaveLength(1);
  });

  it("preserves existing context without rereading an already inspected file", async () => {
    const initialState = createState();
    initialState.inspectedFiles = [{ path: "a.ts", content: "Previously read" }];
    rmSync(join(initialState.repository.repositoryRoot, "a.ts"));
    const inspect = vi.spyOn(inspection, "inspectFiles");
    const planner = vi.fn<Planner>()
      .mockResolvedValueOnce({ type: "inspect", request: { paths: ["a.ts", "b.ts"] } })
      .mockResolvedValueOnce({ type: "complete", task });

    const result = await runPlanningLoop({ goalId: "goal-harness", taskId: "task-harness", initialState, planner, limits });

    expect(result.status).toBe("completed");
    expect(inspect).toHaveBeenCalledWith(initialState.repository.repositoryRoot, { paths: ["b.ts"] });
    expect(result.state.inspectedFiles[0]).toEqual({ path: "a.ts", content: "Previously read" });
    expect(initialState.inspectedFiles).toHaveLength(1);
  });

  it.each([
    { paths: [] },
    { paths: ["a.ts"] },
    { paths: [`.${sep}a.ts`, "a.ts"] },
  ])(
    "fails when the request supplies no new context: $paths", async ({ paths }) => {
      const initialState = createState();
      initialState.inspectedFiles = [{ path: "a.ts", content: "A" }];
      const inspect = vi.spyOn(inspection, "inspectFiles");
      const planner = vi.fn<Planner>().mockResolvedValue({ type: "inspect", request: { paths } });

      expect(await runPlanningLoop({ goalId: "goal-harness", taskId: "task-harness", initialState, planner, limits })).toEqual({
        status: "failed", state: initialState, rounds: 1,
        reason: "No new inspection context requested.",
      });
      expect(inspect).not.toHaveBeenCalled();
      expect(planner).toHaveBeenCalledOnce();
    },
  );

  it("counts every requested path before deduplication for maxFilesPerRequest", async () => {
    const initialState = createState();
    const inspect = vi.spyOn(inspection, "inspectFiles");
    const planner = vi.fn<Planner>().mockResolvedValue({ type: "inspect", request: { paths: ["a.ts", "a.ts"] } });
    const result = await runPlanningLoop({ goalId: "goal-harness", taskId: "task-harness", initialState, planner, limits: { ...limits, maxFilesPerRequest: 1 } });

    expect(result).toEqual({ status: "failed", state: initialState, rounds: 1, reason: "Inspection request exceeds maxFilesPerRequest." });
    expect(inspect).not.toHaveBeenCalled();
  });

  it("rejects the entire request before reading when maxTotalFiles would be exceeded", async () => {
    const initialState = createState();
    initialState.inspectedFiles = [{ path: "a.ts", content: "A" }];
    const inspect = vi.spyOn(inspection, "inspectFiles");
    const planner = vi.fn<Planner>().mockResolvedValue({ type: "inspect", request: { paths: ["a.ts", "b.ts"] } });

    expect(await runPlanningLoop({ goalId: "goal-harness", taskId: "task-harness", initialState, planner, limits: { ...limits, maxTotalFiles: 1 } })).toEqual({
      status: "failed", state: initialState, rounds: 1, reason: "Inspection request exceeds maxTotalFiles.",
    });
    expect(inspect).not.toHaveBeenCalled();
  });

  it("counts only distinct new files and allows exactly maxTotalFiles", async () => {
    const initialState = createState();
    const planner = vi.fn<Planner>()
      .mockResolvedValueOnce({ type: "inspect", request: { paths: ["a.ts", `.${sep}a.ts`, "a.ts"] } })
      .mockResolvedValueOnce({ type: "complete", task });

    const result = await runPlanningLoop({ goalId: "goal-harness", taskId: "task-harness", initialState, planner, limits: { ...limits, maxTotalFiles: 1 } });
    expect(result.status).toBe("completed");
    expect(result.state.inspectedFiles).toEqual([{ path: "a.ts", content: "A 내용" }]);
  });

  it("allows completion on the last permitted round", async () => {
    const planner = vi.fn<Planner>().mockResolvedValue({ type: "complete", task });
    const result = await runPlanningLoop({ goalId: "goal-harness", taskId: "task-harness", initialState: createState(), planner, limits: { ...limits, maxRounds: 1 } });
    expect(result.status).toBe("completed");
    expect(result.rounds).toBe(1);
  });

  it("fails an inspect decision on the last round without reading files or calling planner again", async () => {
    const initialState = createState();
    const inspect = vi.spyOn(inspection, "inspectFiles");
    const planner = vi.fn<Planner>().mockResolvedValue({ type: "inspect", request: { paths: ["a.ts"] } });

    expect(await runPlanningLoop({ goalId: "goal-harness", taskId: "task-harness", initialState, planner, limits: { ...limits, maxRounds: 1 } })).toEqual({
      status: "failed", state: initialState, rounds: 1, reason: "Planning round limit reached.",
    });
    expect(planner).toHaveBeenCalledOnce();
    expect(inspect).not.toHaveBeenCalled();
  });

  it("does not call planner when maxRounds is zero", async () => {
    const planner = vi.fn<Planner>();
    const result = await runPlanningLoop({ goalId: "goal-harness", taskId: "task-harness", initialState: createState(), planner, limits: { ...limits, maxRounds: 0 } });
    expect(result).toMatchObject({ status: "failed", rounds: 0, reason: "Planning round limit reached." });
    expect(planner).not.toHaveBeenCalled();
  });

  it("returns a stable failure for an invalid completed TaskContract", async () => {
    const initialState = createState();
    const planner = vi.fn<Planner>().mockResolvedValue({ type: "complete", task: { ...task, objective: "" } });
    expect(await runPlanningLoop({ goalId: "goal-harness", taskId: "task-harness", initialState, planner, limits })).toEqual({
      status: "failed", state: initialState, rounds: 1, reason: "Planner returned a task draft that could not be finalized.",
    });
  });

  it.each(["throw", "reject"])("propagates planner %s errors", async (mode) => {
    const error = new Error("Planner integration failed");
    const planner = vi.fn<Planner>();
    if (mode === "throw") {
      planner.mockImplementation(() => { throw error; });
    } else {
      planner.mockRejectedValue(error);
    }
    await expect(runPlanningLoop({ goalId: "goal-harness", taskId: "task-harness", initialState: createState(), planner, limits })).rejects.toBe(error);
  });

  it("propagates unexpected inspection filesystem errors", async () => {
    const error = Object.assign(new Error("Permission denied"), { code: "EACCES" });
    vi.spyOn(inspection, "inspectFiles").mockImplementation(() => { throw error; });
    const planner = vi.fn<Planner>().mockResolvedValue({ type: "inspect", request: { paths: ["a.ts"] } });
    await expect(runPlanningLoop({ goalId: "goal-harness", taskId: "task-harness", initialState: createState(), planner, limits })).rejects.toBe(error);
  });

  it("converts expected inspection request errors to a stable workflow failure", async () => {
    const initialState = createState();
    vi.spyOn(inspection, "inspectFiles").mockImplementation(() => {
      throw new inspection.InspectionRequestError("Request details");
    });
    const planner = vi.fn<Planner>().mockResolvedValue({ type: "inspect", request: { paths: ["a.ts"] } });

    expect(await runPlanningLoop({ goalId: "goal-harness", taskId: "task-harness", initialState, planner, limits })).toEqual({
      status: "failed", state: initialState, rounds: 1, reason: "Inspection request is invalid.",
    });
    expect(planner).toHaveBeenCalledOnce();
  });

  it("delegates unsafe request validation to inspectFiles", async () => {
    const initialState = createState();
    const inspect = vi.spyOn(inspection, "inspectFiles");
    const paths = ["../outside.ts"];
    const planner = vi.fn<Planner>().mockResolvedValue({ type: "inspect", request: { paths } });

    expect(await runPlanningLoop({ goalId: "goal-harness", taskId: "task-harness", initialState, planner, limits })).toEqual({
      status: "failed", state: initialState, rounds: 1, reason: "Inspection request is invalid.",
    });
    expect(inspect).toHaveBeenCalledWith(initialState.repository.repositoryRoot, { paths });
  });

  it.each([NaN, Infinity, -1, 1.5])("rejects invalid limits before calling planner: %s", async (maxRounds) => {
    const planner = vi.fn<Planner>();
    const result = await runPlanningLoop({ goalId: "goal-harness", taskId: "task-harness", initialState: createState(), planner, limits: { ...limits, maxRounds } });
    expect(result).toMatchObject({ status: "failed", rounds: 0, reason: "Planning limits must be non-negative safe integers." });
    expect(planner).not.toHaveBeenCalled();
  });
});
