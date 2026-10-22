import { execFileSync } from "node:child_process";
import { existsSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, beforeEach, expect, it, vi } from "vitest";

import type { ExecutionResult } from "@/application/execution/index.js";
import {
  createExecutionWorkspace,
  removeExecutionWorkspace,
} from "@/infrastructure/git/index.js";

import { approveWorkspaceDeletion } from "../../prompts/cleanup/index.js";
import { runWorkspaceCleanup } from "./workspace-cleanup.js";
vi.mock("../../prompts/cleanup/index.js", () => ({
  approveWorkspaceDeletion: vi.fn(),
}));
vi.mock("@/infrastructure/git/index.js", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("@/infrastructure/git/index.js")>();
  return {
    ...actual,
    removeExecutionWorkspace: vi.fn(actual.removeExecutionWorkspace),
  };
});
let root: string;
let artifacts: string;
let workspace: string;
let execution: ExecutionResult;
beforeEach(async () => {
  vi.clearAllMocks();
  vi.spyOn(console, "log").mockImplementation(() => {});
  vi.mocked(removeExecutionWorkspace).mockImplementation(
    (
      await vi.importActual<typeof import("@/infrastructure/git/index.js")>(
        "@/infrastructure/git/index.js"
      )
    ).removeExecutionWorkspace
  );
  root = mkdtempSync(join(tmpdir(), "cleanup-repo-"));
  artifacts = mkdtempSync(join(tmpdir(), "cleanup-artifacts-"));
  const git = (...args: string[]) =>
    execFileSync("git", args, { cwd: root, stdio: "pipe" });
  git("init", "--quiet");
  git("config", "user.name", "Test");
  git("config", "user.email", "test@example.com");
  writeFileSync(join(root, "README.md"), "original\n");
  git("add", ".");
  git("commit", "--quiet", "-m", "initial");
  workspace = createExecutionWorkspace(root);
  writeFileSync(join(workspace, "README.md"), "worker edit\n");
  writeFileSync(join(artifacts, "changes.patch"), "preserved");
  execution = {
    passed: true,
    evidence: {},
    failures: [],
    workspace: { path: workspace },
    artifacts: { directory: artifacts },
  };
});
afterEach(() => {
  vi.restoreAllMocks();
  if (existsSync(workspace))
    execFileSync("git", ["worktree", "remove", "--force", workspace], {
      cwd: root,
    });
  rmSync(root, { force: true, recursive: true });
  rmSync(artifacts, { force: true, recursive: true });
});
it("Delete removes workspace but preserves artifacts and ExecutionResult", async () => {
  vi.mocked(approveWorkspaceDeletion).mockResolvedValue(true);
  const before = structuredClone(execution);
  const result = await runWorkspaceCleanup(root, execution);
  expect(result.status).toBe("deleted");
  if ("durationMs" in result)
    expect(result.durationMs).toBeGreaterThanOrEqual(0);
  expect(existsSync(workspace)).toBe(false);
  expect(existsSync(join(artifacts, "changes.patch"))).toBe(true);
  expect(execution).toEqual(before);
});
it("Keep leaves Worker changes intact", async () => {
  vi.mocked(approveWorkspaceDeletion).mockResolvedValue(false);
  expect(await runWorkspaceCleanup(root, execution)).toEqual({
    status: "kept",
  });
  expect(existsSync(workspace)).toBe(true);
  expect(removeExecutionWorkspace).not.toHaveBeenCalled();
});
it("reports cleanup failure separately with the workspace path", async () => {
  vi.mocked(approveWorkspaceDeletion).mockResolvedValue(true);
  vi.mocked(removeExecutionWorkspace).mockImplementation(() => {
    throw new Error("cleanup failed");
  });
  const before = structuredClone(execution);
  const delivery = { push: { status: "pushed" } };
  const result = await runWorkspaceCleanup(root, execution);
  expect(result).toMatchObject({ status: "failed", reason: "cleanup failed" });
  expect(execution).toEqual(before);
  expect(delivery.push.status).toBe("pushed");
  expect(existsSync(workspace)).toBe(true);
  expect(vi.mocked(console.log).mock.calls.flat().join("\n")).toContain(
    workspace
  );
});
