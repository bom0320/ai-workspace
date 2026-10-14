import { beforeEach, describe, expect, it, vi } from "vitest";

import { captureRepositorySnapshot, loadSnapshotFiles, runIndependentDecisions, type AgentDecision } from "@/application/decision/index.js";

import { runDecisionCommand } from "./decision.js";

vi.mock("@/application/decision/index.js", () => ({
  captureRepositorySnapshot: vi.fn(), loadSnapshotFiles: vi.fn(), runIndependentDecisions: vi.fn(),
}));
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

describe("runDecisionCommand", () => {
  it.each(["", "   "])("rejects a missing repository path: %j", async (repositoryPath) => {
    await expect(runDecisionCommand({ ...input, repositoryPath })).rejects.toThrow("Repository path is required.");
    expect(captureRepositorySnapshot).not.toHaveBeenCalled();
  });
  it.each(["", "   "])("rejects a missing objective: %j", async (objective) => {
    await expect(runDecisionCommand({ ...input, objective })).rejects.toThrow("Objective is required.");
    expect(captureRepositorySnapshot).not.toHaveBeenCalled();
  });
  it("rejects missing context files", async () => {
    await expect(runDecisionCommand({ ...input, filePaths: [] })).rejects.toThrow("At least one decision context file is required.");
    expect(captureRepositorySnapshot).not.toHaveBeenCalled();
  });
  it("captures the Snapshot, loads explicit files, creates a shared Goal and delegates the two read-only roles", async () => {
    expect(await runDecisionCommand(input)).toEqual({ snapshot, decisions });
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
    await expect(runDecisionCommand(input)).rejects.toBe(error);
    expect(loadSnapshotFiles).not.toHaveBeenCalled();
    expect(runIndependentDecisions).not.toHaveBeenCalled();
  });
  it("does not execute Specialists when the file loader rejects a path", async () => {
    const error = new Error("Invalid context path");
    vi.mocked(loadSnapshotFiles).mockImplementation(() => { throw error; });
    await expect(runDecisionCommand(input)).rejects.toBe(error);
    expect(runIndependentDecisions).not.toHaveBeenCalled();
  });
  it("propagates orchestration failures without returning partial results", async () => {
    const error = new Error("Evidence validation failed");
    vi.mocked(runIndependentDecisions).mockRejectedValue(error);
    await expect(runDecisionCommand(input)).rejects.toBe(error);
  });
});
