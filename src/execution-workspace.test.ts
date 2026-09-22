import { execFileSync } from "node:child_process";
import {
  existsSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import {
  createExecutionWorkspace,
  removeExecutionWorkspace,
} from "./execution-workspace.js";

let repositoryPath: string | undefined;
let workspacePath: string | undefined;

function createGitRepository(): string {
  const repository = mkdtempSync(
    join(tmpdir(), "ai-workspace-source-repository-"),
  );

  execFileSync("git", ["init", "--quiet", repository]);
  execFileSync("git", ["-C", repository, "config", "user.name", "Test User"]);
  execFileSync("git", ["-C", repository, "config", "user.email", "test@example.com"]);

  writeFileSync(join(repository, "committed.txt"), "committed content\n");
  execFileSync("git", ["-C", repository, "add", "committed.txt"]);
  execFileSync("git", ["-C", repository, "commit", "--quiet", "-m", "initial"]);

  repositoryPath = repository;

  return repository;
}

afterEach(() => {
  if (
    repositoryPath &&
    workspacePath &&
    existsSync(repositoryPath) &&
    existsSync(workspacePath)
  ) {
    try {
      execFileSync("git", [
        "-C",
        repositoryPath,
        "worktree",
        "remove",
        "--force",
        workspacePath,
      ]);
    } catch {
      // Fall through to filesystem cleanup.
    }
  }

  if (workspacePath) {
    rmSync(workspacePath, { force: true, recursive: true });
  }

  if (repositoryPath) {
    rmSync(repositoryPath, { force: true, recursive: true });
  }

  repositoryPath = undefined;
  workspacePath = undefined;
});

describe("createExecutionWorkspace", () => {
  it("creates a detached Git worktree from the repository HEAD", () => {
    const repository = createGitRepository();

    workspacePath = createExecutionWorkspace(repository);

    expect(workspacePath).not.toBe(repository);
    expect(readFileSync(join(workspacePath, "committed.txt"), "utf8")).toBe(
      "committed content\n",
    );
    expect(
      execFileSync(
        "git",
        ["-C", workspacePath, "rev-parse", "--is-inside-work-tree"],
        { encoding: "utf8" },
      ).trim(),
    ).toBe("true");
    expect(
      execFileSync(
        "git",
        ["-C", workspacePath, "rev-parse", "--abbrev-ref", "HEAD"],
        { encoding: "utf8" },
      ).trim(),
    ).toBe("HEAD");
  });

  it("reports Git failures with execution workspace context", () => {
    const repository = mkdtempSync(
      join(tmpdir(), "ai-workspace-empty-repository-"),
    );

    repositoryPath = repository;
    execFileSync("git", ["init", "--quiet", repository]);

    expect(() => createExecutionWorkspace(repository)).toThrow(
      "Failed to create execution workspace",
    );
  });
});

describe("removeExecutionWorkspace", () => {
  it("force removes the worktree directory and Git registration", () => {
    const repository = createGitRepository();

    workspacePath = createExecutionWorkspace(repository);

    expect(existsSync(workspacePath)).toBe(true);
    expect(
      execFileSync("git", ["-C", repository, "worktree", "list", "--porcelain"], {
        encoding: "utf8",
      }),
    ).toContain(workspacePath);

    writeFileSync(join(workspacePath, "committed.txt"), "modified content\n");
    writeFileSync(join(workspacePath, "untracked.txt"), "untracked content\n");

    removeExecutionWorkspace(repository, workspacePath);

    expect(existsSync(workspacePath)).toBe(false);
    expect(
      execFileSync("git", ["-C", repository, "worktree", "list", "--porcelain"], {
        encoding: "utf8",
      }),
    ).not.toContain(workspacePath);
  });

  it("reports Git failures with removal context", () => {
    const repository = createGitRepository();
    const missingWorkspace = join(repository, "missing-worktree");

    expect(() =>
      removeExecutionWorkspace(repository, missingWorkspace),
    ).toThrow("Failed to remove execution workspace");
  });
});
