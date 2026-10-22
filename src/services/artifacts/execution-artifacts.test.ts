import { execFileSync } from "node:child_process";
import {
  existsSync,
  mkdtempSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  rmSync,
  unlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, it, vi } from "vitest";

import type { TaskContract } from "@/contracts/task.js";
import * as gitInfrastructure from "@/infrastructure/git/index.js";

import {
  createExecutionRun,
  getExecutionBaseCommit,
  preserveExecutionChanges,
  writeExecutionResult,
} from "./execution-artifacts.js";

vi.mock("@/infrastructure/git/index.js", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/infrastructure/git/index.js")>()),
}));

const temporaryRoots: string[] = [];

const task: TaskContract = {
  id: "artifact-test",
  goalId: "artifact-goal",
  objective: "Preserve execution changes",
  targetRepository: "temporary-repository",
  allowedPaths: ["modified.txt", "new.txt", "deleted.txt", "binary.bin"],
  forbiddenPaths: [],
  constraints: ["Keep the original repository unchanged"],
  acceptanceCriteria: ["The patch restores every change"],
  verification: ["test -f modified.txt"],
};

function git(repositoryRoot: string, args: string[]): string {
  return execFileSync("git", ["-C", repositoryRoot, ...args], {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  });
}

function createRepository(): {
  root: string;
  repositoryRoot: string;
  workspaceRoot: string;
  baseCommit: string;
} {
  const root = mkdtempSync(join(tmpdir(), "execution-artifacts-test-"));
  temporaryRoots.push(root);
  const repositoryRoot = join(root, "repository");
  const workspaceRoot = join(root, "workspace");
  mkdirSync(repositoryRoot);

  git(repositoryRoot, ["init"]);
  git(repositoryRoot, ["config", "user.name", "Execution Artifacts Test"]);
  git(repositoryRoot, ["config", "user.email", "test@example.invalid"]);
  writeFileSync(join(repositoryRoot, "modified.txt"), "before\n");
  writeFileSync(join(repositoryRoot, "deleted.txt"), "delete me\n");
  writeFileSync(join(repositoryRoot, "binary.bin"), Buffer.from([0, 1, 2, 3]));
  git(repositoryRoot, ["add", "."]);
  git(repositoryRoot, ["commit", "-m", "initial"]);

  const baseCommit = git(repositoryRoot, ["rev-parse", "HEAD"]).trim();
  git(repositoryRoot, [
    "worktree",
    "add",
    "--detach",
    workspaceRoot,
    baseCommit,
  ]);

  return { root, repositoryRoot, workspaceRoot, baseCommit };
}

afterEach(() => {
  vi.restoreAllMocks();
  for (const root of temporaryRoots.splice(0)) {
    rmSync(root, { force: true, recursive: true });
  }
});

describe("execution artifacts", () => {
  it("preserves modified, new, deleted, and binary files without changing the original index", () => {
    const { root, repositoryRoot, workspaceRoot, baseCommit } =
      createRepository();
    writeFileSync(
      join(repositoryRoot, "index-only.txt"),
      "staged in original\n"
    );
    git(repositoryRoot, ["add", "index-only.txt"]);
    const originalStatus = git(repositoryRoot, ["status", "--porcelain"]);
    const originalIndex = git(repositoryRoot, ["diff", "--cached", "--binary"]);

    writeFileSync(join(workspaceRoot, "modified.txt"), "after\n");
    writeFileSync(join(workspaceRoot, "new.txt"), "new file\n");
    unlinkSync(join(workspaceRoot, "deleted.txt"));
    writeFileSync(
      join(workspaceRoot, "binary.bin"),
      Buffer.from([0, 9, 8, 7, 6])
    );

    const runDirectory = createExecutionRun(task, join(root, "runs"));
    expect(getExecutionBaseCommit(workspaceRoot)).toBe(baseCommit);
    preserveExecutionChanges(workspaceRoot, runDirectory, baseCommit);
    writeExecutionResult(runDirectory, {
      passed: true,
      evidence: {
        changedPaths: ["binary.bin", "deleted.txt", "modified.txt", "new.txt"],
      },
      failures: [],
      artifacts: { directory: runDirectory, baseCommit },
    });

    git(repositoryRoot, ["worktree", "remove", "--force", workspaceRoot]);
    expect(existsSync(workspaceRoot)).toBe(false);
    expect(existsSync(join(runDirectory, "changes.patch"))).toBe(true);
    expect(existsSync(join(runDirectory, "task.json"))).toBe(true);
    expect(existsSync(join(runDirectory, "result.json"))).toBe(true);
    expect(
      readFileSync(join(runDirectory, "base-commit.txt"), "utf8").trim()
    ).toBe(baseCommit);

    const restoredRoot = join(root, "restored");
    execFileSync("git", ["clone", repositoryRoot, restoredRoot], {
      stdio: "pipe",
    });
    git(restoredRoot, ["checkout", "--detach", baseCommit]);
    git(restoredRoot, [
      "apply",
      "--binary",
      join(runDirectory, "changes.patch"),
    ]);

    expect(readFileSync(join(restoredRoot, "modified.txt"), "utf8")).toBe(
      "after\n"
    );
    expect(readFileSync(join(restoredRoot, "new.txt"), "utf8")).toBe(
      "new file\n"
    );
    expect(existsSync(join(restoredRoot, "deleted.txt"))).toBe(false);
    expect(readFileSync(join(restoredRoot, "binary.bin"))).toEqual(
      Buffer.from([0, 9, 8, 7, 6])
    );
    expect(git(repositoryRoot, ["status", "--porcelain"])).toBe(originalStatus);
    expect(git(repositoryRoot, ["diff", "--cached", "--binary"])).toBe(
      originalIndex
    );
    expect(readFileSync(join(repositoryRoot, "modified.txt"), "utf8")).toBe(
      "before\n"
    );
  });

  it("preserves changes committed by the Worker relative to the starting commit", () => {
    const { root, repositoryRoot, workspaceRoot, baseCommit } =
      createRepository();
    git(workspaceRoot, ["config", "user.name", "Worker"]);
    git(workspaceRoot, ["config", "user.email", "worker@example.invalid"]);
    writeFileSync(join(workspaceRoot, "modified.txt"), "committed change\n");
    git(workspaceRoot, ["add", "modified.txt"]);
    git(workspaceRoot, ["commit", "-m", "worker commit"]);

    const runDirectory = createExecutionRun(task, join(root, "runs"));
    preserveExecutionChanges(workspaceRoot, runDirectory, baseCommit);
    git(repositoryRoot, ["worktree", "remove", "--force", workspaceRoot]);

    const restoredRoot = join(root, "restored-commit");
    execFileSync("git", ["clone", repositoryRoot, restoredRoot], {
      stdio: "pipe",
    });
    git(restoredRoot, ["checkout", "--detach", baseCommit]);
    git(restoredRoot, [
      "apply",
      "--binary",
      join(runDirectory, "changes.patch"),
    ]);

    expect(readFileSync(join(restoredRoot, "modified.txt"), "utf8")).toBe(
      "committed change\n"
    );
    expect(git(repositoryRoot, ["rev-parse", "HEAD"]).trim()).toBe(baseCommit);
  });
});

describe("execution artifact failure meaning", () => {
  it("retains run-directory and final-result write failure context", () => {
    const { root } = createRepository();
    const notDirectory = join(root, "file");
    writeFileSync(notDirectory, "file");
    expect(() => createExecutionRun(task, notDirectory)).toThrow(
      "Failed to create execution result directory"
    );
    expect(() => writeExecutionResult(notDirectory, {})).toThrow(
      "Failed to write final execution result"
    );
  });

  it("retains base-commit lookup failure context and its original cause", () => {
    const { root } = createRepository();
    try {
      getExecutionBaseCommit(join(root, "missing"));
      expect.fail("Base lookup should fail");
    } catch (error) {
      expect((error as Error).message).toContain(
        "Failed to determine patch base commit"
      );
      expect((error as Error).cause).toBeInstanceOf(Error);
    }
  });

  it("records the base first and preserves a previous patch if Git read-tree fails", () => {
    const { root, workspaceRoot } = createRepository();
    const run = createExecutionRun(task, join(root, "runs"));
    writeFileSync(join(run, "changes.patch"), "previous patch");
    expect(() =>
      preserveExecutionChanges(workspaceRoot, run, "missing-base")
    ).toThrow("Failed to preserve execution changes");
    expect(readFileSync(join(run, "base-commit.txt"), "utf8")).toBe(
      "missing-base\n"
    );
    expect(readFileSync(join(run, "changes.patch"), "utf8")).toBe(
      "previous patch"
    );
    expect(
      readdirSync(run).some((path) => path.startsWith(".patch-index-"))
    ).toBe(false);
  });

  it("wraps patch storage failure without changing the workspace index", () => {
    const { root, workspaceRoot, baseCommit } = createRepository();
    const run = createExecutionRun(task, join(root, "runs"));
    mkdirSync(join(run, "changes.patch"));
    const before = git(workspaceRoot, ["status", "--porcelain"]);
    expect(() =>
      preserveExecutionChanges(workspaceRoot, run, baseCommit)
    ).toThrow("Failed to preserve execution changes");
    expect(readFileSync(join(run, "base-commit.txt"), "utf8")).toBe(
      `${baseCommit}\n`
    );
    expect(
      readdirSync(run).some((path) => path.startsWith(".patch-index-"))
    ).toBe(false);
    expect(git(workspaceRoot, ["status", "--porcelain"])).toBe(before);
  });

  it("does not begin Git preservation if writing base-commit.txt fails", () => {
    const { root, workspaceRoot, baseCommit } = createRepository();
    const run = createExecutionRun(task, join(root, "runs"));
    mkdirSync(join(run, "base-commit.txt"));
    const writePatch = vi.spyOn(gitInfrastructure, "writeWorkspacePatch");
    expect(() =>
      preserveExecutionChanges(workspaceRoot, run, baseCommit)
    ).toThrow("Failed to preserve execution changes");
    expect(writePatch).not.toHaveBeenCalled();
    expect(existsSync(join(run, "changes.patch"))).toBe(false);
  });

  it("preserves the original unwrapped cleanup failure from the old finally block", () => {
    const { root, workspaceRoot, baseCommit } = createRepository();
    const run = createExecutionRun(task, join(root, "runs"));
    const original = new Error("Cleanup failed");
    vi.spyOn(gitInfrastructure, "writeWorkspacePatch").mockImplementationOnce(
      () => {
        throw new gitInfrastructure.WorkspacePatchCleanupError(original);
      }
    );
    try {
      preserveExecutionChanges(workspaceRoot, run, baseCommit);
      expect.fail("Cleanup should fail");
    } catch (error) {
      expect(error).toBe(original);
    }
  });
});
