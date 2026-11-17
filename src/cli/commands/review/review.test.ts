import { afterEach, beforeEach, expect, it, vi } from "vitest";

import type { ExecutionResult } from "@/application/execution/index.js";
import { getWorkspaceDiff } from "@/infrastructure/git/index.js";

import { completeReview } from "../../prompts/review/index.js";
import { runReviewStage } from "./review.js";
vi.mock("@/infrastructure/git/index.js", () => ({ getWorkspaceDiff: vi.fn() }));
vi.mock("../../prompts/review/index.js", () => ({ completeReview: vi.fn() }));
let execution: ExecutionResult;
beforeEach(() => {
  vi.resetAllMocks();
  vi.spyOn(console, "log").mockImplementation(() => {});
  execution = {
    passed: true,
    workspace: { path: "/tmp/workspace" },
    evidence: {
      changedPaths: ["README.md"],
      workerOutput: "Updated introduction",
    },
    failures: [],
    artifacts: { directory: "/runs/run-1", baseCommit: "base" },
  };
  vi.mocked(getWorkspaceDiff).mockReturnValue({
    content: "diff --git a/README.md b/README.md",
    truncated: false,
  });
});
afterEach(() => vi.restoreAllMocks());
it("always displays workspace, changed paths, diff and Worker output before Continue", async () => {
  vi.mocked(completeReview).mockResolvedValue(true);
  expect(await runReviewStage(execution)).toEqual({ status: "continued" });
  expect(getWorkspaceDiff).toHaveBeenCalledWith("/tmp/workspace", "base");
  const output = vi.mocked(console.log).mock.calls.flat().join("\n");
  for (const text of [
    "/tmp/workspace",
    "- README.md",
    "diff --git",
    "Updated introduction",
  ])
    expect(output).toContain(text);
  expect(vi.mocked(console.log).mock.invocationCallOrder[0]).toBeLessThan(
    vi.mocked(completeReview).mock.invocationCallOrder[0]
  );
});
it("returns Abort without changing successful Execution", async () => {
  const before = structuredClone(execution);
  vi.mocked(completeReview).mockResolvedValue(false);
  expect(await runReviewStage(execution)).toEqual({ status: "aborted" });
  expect(execution).toEqual(before);
});
it("omits missing Worker output", async () => {
  delete execution.evidence.workerOutput;
  await runReviewStage(execution);
  expect(vi.mocked(console.log).mock.calls.flat().join("\n")).not.toContain(
    "Worker Result:"
  );
});
it("reports truncation and paths to full evidence", async () => {
  vi.mocked(getWorkspaceDiff).mockReturnValue({
    content: "limited diff",
    truncated: true,
  });
  execution.evidence.workerOutput = "x".repeat(50_000);
  await runReviewStage(execution);
  const output = vi.mocked(console.log).mock.calls.flat().join("\n");
  expect(output).toContain("Diff truncated");
  expect(output).toContain("/runs/run-1/changes.patch");
  expect(output.length).toBeLessThan(18_000);
});
it("blocks Continue when diff cannot be read", async () => {
  vi.mocked(getWorkspaceDiff).mockImplementation(() => {
    throw new Error("diff failed");
  });
  expect(await runReviewStage(execution)).toEqual({
    status: "failed",
    reason: "diff failed",
  });
  expect(completeReview).not.toHaveBeenCalled();
  expect(execution.passed).toBe(true);
});
