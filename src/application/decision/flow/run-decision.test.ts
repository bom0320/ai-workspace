import { beforeEach, describe, expect, it, vi } from "vitest";

import type { AgentDecision } from "../protocol/decision.js";
import { captureRepositorySnapshot } from "./context/repository-snapshot.js";
import { loadSnapshotFiles } from "./context/load-snapshot-files.js";
import { runIndependentDecisions } from "./orchestration/run-independent-decisions.js";

import { runDecision } from "./run-decision.js";

vi.mock("./context/repository-snapshot.js", () => ({ captureRepositorySnapshot: vi.fn() }));
vi.mock("./context/load-snapshot-files.js", () => ({ loadSnapshotFiles: vi.fn() }));
vi.mock("./orchestration/run-independent-decisions.js", () => ({ runIndependentDecisions: vi.fn() }));
const snapshot = { repositoryRoot: "/repositories/example", commitSha: "abc123" };
const files = [{ path: "src/button.tsx", content: "// button" }];
const decisions: AgentDecision[] = ["frontend", "ux"].map((specialistId) => ({
  specialistId, recommendation: "Review this change", evidence: [], risks: [], uncertainty: [],
}));
const input = { repositoryPath: "/repositories/example", objective: "Evaluate the interface", filePaths: ["src/button.tsx"] };

beforeEach(() => {
  vi.resetAllMocks();
  vi.mocked(captureRepositorySnapshot).mockReturnValue(snapshot);
  vi.mocked(loadSnapshotFiles).mockReturnValue(files);
  vi.mocked(runIndependentDecisions).mockResolvedValue(decisions);
});

describe("runDecision", () => {
  it.each(["", "   "])("rejects a missing repository path: %j", async (repositoryPath) => {
    await expect(runDecision({ ...input, repositoryPath })).rejects.toThrow("Repository path is required.");
    expect(captureRepositorySnapshot).not.toHaveBeenCalled();
  });
  it.each(["", "   "])("rejects a missing objective: %j", async (objective) => {
    await expect(runDecision({ ...input, objective })).rejects.toThrow("Objective is required.");
    expect(captureRepositorySnapshot).not.toHaveBeenCalled();
  });
  it("rejects missing context files", async () => {
    await expect(runDecision({ ...input, filePaths: [] })).rejects.toThrow("At least one decision context file is required.");
    expect(captureRepositorySnapshot).not.toHaveBeenCalled();
  });
  it("captures the Snapshot, loads explicit files, creates a shared Goal and delegates the two read-only roles", async () => {
    expect(await runDecision(input)).toEqual({ snapshot, decisions });
    expect(captureRepositorySnapshot).toHaveBeenCalledWith(input.repositoryPath);
    expect(loadSnapshotFiles).toHaveBeenCalledWith(snapshot, input.filePaths);
    expect(runIndependentDecisions).toHaveBeenCalledOnce();
    const [actualSnapshot, goal, inputs] = vi.mocked(runIndependentDecisions).mock.calls[0];
    expect(actualSnapshot).toBe(snapshot);
    expect(goal).toEqual({ objective: input.objective, targetRepository: "example" });
    expect(inputs.map(({ specialist }) => specialist)).toEqual([
      { id: "frontend", role: "Frontend Specialist", objective: expect.stringContaining("frontend implementation"), authority: { repositoryAccess: "read", shellExecution: false } },
      { id: "ux", role: "UX Specialist", objective: expect.stringContaining("interaction quality"), authority: { repositoryAccess: "read", shellExecution: false } },
    ]);
    for (const item of inputs) expect(item.files).toBe(files);
  });
  it("propagates dirty Snapshot errors without loading files or starting decisions", async () => {
    const error = new Error("repository has uncommitted or untracked changes");
    vi.mocked(captureRepositorySnapshot).mockImplementation(() => { throw error; });
    await expect(runDecision(input)).rejects.toBe(error);
    expect(loadSnapshotFiles).not.toHaveBeenCalled();
    expect(runIndependentDecisions).not.toHaveBeenCalled();
  });
  it("does not execute Specialists when the file loader rejects a path", async () => {
    const error = new Error("Invalid context path");
    vi.mocked(loadSnapshotFiles).mockImplementation(() => { throw error; });
    await expect(runDecision(input)).rejects.toBe(error);
    expect(runIndependentDecisions).not.toHaveBeenCalled();
  });
  it("propagates orchestration failures without returning partial results", async () => {
    const error = new Error("Evidence validation failed");
    vi.mocked(runIndependentDecisions).mockRejectedValue(error);
    await expect(runDecision(input)).rejects.toBe(error);
  });
});
