import { execFileSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, expect, it, vi } from "vitest";
import type { TaskContract } from "@/contracts/task.js";
import { createExecutionRun } from "@/services/artifacts/index.js";
import { removeExecutionWorkspace } from "@/infrastructure/git/index.js";
import { executeTask } from "./execute-task.js";
vi.mock("../worker/codex-worker.js", () => ({ runCodexWorker: vi.fn(async (_task, workspace: string) => {
  writeFileSync(join(workspace, "README.md"), "Worker updated introduction\n"); return "Updated introduction";
}) }));
vi.mock("@/services/artifacts/index.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/services/artifacts/index.js")>();
  return { ...actual, createExecutionRun: vi.fn(actual.createExecutionRun) };
});
let repository: string | undefined;
let artifacts: string | undefined;
let workspace: string | undefined;
afterEach(() => {
  if (workspace && repository && existsSync(workspace)) removeExecutionWorkspace(repository, workspace);
  if (repository) rmSync(repository, { recursive: true, force: true });
  if (artifacts) rmSync(artifacts, { recursive: true, force: true });
});
it("returns a live workspace with Worker changes and permanent artifacts until caller cleanup", async () => {
  repository = mkdtempSync(join(tmpdir(), "execution-lifecycle-")); artifacts = mkdtempSync(join(tmpdir(), "lifecycle-artifacts-"));
  const git = (...args: string[]) => execFileSync("git", args, { cwd: repository, stdio: "pipe" });
  git("init", "--quiet"); git("config", "user.name", "Test"); git("config", "user.email", "test@example.com"); writeFileSync(join(repository, "README.md"), "original\n"); git("add", "."); git("commit", "--quiet", "-m", "initial");
  const actual = await vi.importActual<typeof import("@/services/artifacts/index.js")>("@/services/artifacts/index.js");
  vi.mocked(createExecutionRun).mockImplementation((task) => actual.createExecutionRun(task, artifacts));
  const task: TaskContract = { id: "task-1", goalId: "goal-1", objective: "Update introduction", targetRepository: "example", allowedPaths: ["README.md"], forbiddenPaths: [], constraints: [], acceptanceCriteria: ["Clear introduction"], verification: ["git diff --check"] };
  const result = await executeTask(task, repository);
  workspace = result.workspace!.path;
  expect(result.passed).toBe(true); expect(existsSync(workspace)).toBe(true);
  expect(readFileSync(join(workspace, "README.md"), "utf8")).toBe("Worker updated introduction\n");
  expect(readFileSync(join(repository, "README.md"), "utf8")).toBe("original\n");
  const directory = result.artifacts!.directory;
  expect(readFileSync(join(directory, "changes.patch"), "utf8")).toContain("+Worker updated introduction");
  expect(JSON.parse(readFileSync(join(directory, "result.json"), "utf8")).workspace.path).toBe(workspace);
  removeExecutionWorkspace(repository, workspace);
  expect(existsSync(workspace)).toBe(false); expect(existsSync(join(directory, "changes.patch"))).toBe(true);
});
