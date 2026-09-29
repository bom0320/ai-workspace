import { execFileSync } from "node:child_process";
import {
  existsSync,
  mkdtempSync,
  mkdirSync,
  readFileSync,
  rmSync,
  unlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import type { TaskContract } from "../contracts/task.js";
import {
  createExecutionRun,
  getExecutionBaseCommit,
  preserveExecutionChanges,
  writeExecutionResult,
} from "./execution-artifacts.js";

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
  git(repositoryRoot, ["worktree", "add", "--detach", workspaceRoot, baseCommit]);

  return { root, repositoryRoot, workspaceRoot, baseCommit };
}

afterEach(() => {
  for (const root of temporaryRoots.splice(0)) {
    rmSync(root, { force: true, recursive: true });
  }
});

describe("execution artifacts", () => {
  it("preserves modified, new, deleted, and binary files without changing the original index", () => {
    const { root, repositoryRoot, workspaceRoot, baseCommit } =
      createRepository();
    writeFileSync(join(repositoryRoot, "index-only.txt"), "staged in original\n");
    git(repositoryRoot, ["add", "index-only.txt"]);
    const originalStatus = git(repositoryRoot, ["status", "--porcelain"]);
    const originalIndex = git(repositoryRoot, ["diff", "--cached", "--binary"]);

    writeFileSync(join(workspaceRoot, "modified.txt"), "after\n");
    writeFileSync(join(workspaceRoot, "new.txt"), "new file\n");
    unlinkSync(join(workspaceRoot, "deleted.txt"));
    writeFileSync(
      join(workspaceRoot, "binary.bin"),
      Buffer.from([0, 9, 8, 7, 6]),
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
    expect(readFileSync(join(runDirectory, "base-commit.txt"), "utf8").trim()).toBe(
      baseCommit,
    );

    const restoredRoot = join(root, "restored");
    execFileSync("git", ["clone", repositoryRoot, restoredRoot], {
      stdio: "pipe",
    });
    git(restoredRoot, ["checkout", "--detach", baseCommit]);
    git(restoredRoot, ["apply", "--binary", join(runDirectory, "changes.patch")]);

    expect(readFileSync(join(restoredRoot, "modified.txt"), "utf8")).toBe(
      "after\n",
    );
    expect(readFileSync(join(restoredRoot, "new.txt"), "utf8")).toBe(
      "new file\n",
    );
    expect(existsSync(join(restoredRoot, "deleted.txt"))).toBe(false);
    expect(readFileSync(join(restoredRoot, "binary.bin"))).toEqual(
      Buffer.from([0, 9, 8, 7, 6]),
    );
    expect(git(repositoryRoot, ["status", "--porcelain"])).toBe(originalStatus);
    expect(git(repositoryRoot, ["diff", "--cached", "--binary"])).toBe(
      originalIndex,
    );
    expect(readFileSync(join(repositoryRoot, "modified.txt"), "utf8")).toBe(
      "before\n",
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
    git(restoredRoot, ["apply", "--binary", join(runDirectory, "changes.patch")]);

    expect(readFileSync(join(restoredRoot, "modified.txt"), "utf8")).toBe(
      "committed change\n",
    );
    expect(git(repositoryRoot, ["rev-parse", "HEAD"]).trim()).toBe(baseCommit);
  });
});
