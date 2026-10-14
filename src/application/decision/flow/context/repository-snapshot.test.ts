import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, relative } from "node:path";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import {
  assertRepositoryMatchesSnapshot,
  captureRepositorySnapshot,
} from "./repository-snapshot.js";

let repositoryRoot: string;
const git = (...args: string[]) => execFileSync("git", args, {
  cwd: repositoryRoot,
  encoding: "utf8",
  stdio: "pipe",
});

beforeEach(() => {
  repositoryRoot = mkdtempSync(join(tmpdir(), "ai-workspace-snapshot-"));
  git("init", "--quiet");
  git("config", "user.name", "Test");
  git("config", "user.email", "test@example.com");
  writeFileSync(join(repositoryRoot, "README.md"), "initial\n");
  git("add", ".");
  git("commit", "--quiet", "-m", "initial");
});

afterEach(() => {
  rmSync(repositoryRoot, { recursive: true, force: true });
});

function makeDirty(kind: string): void {
  writeFileSync(join(repositoryRoot, kind === "untracked" ? "new.txt" : "README.md"), "changed\n");
  if (kind === "staged") git("add", "README.md");
}

describe("captureRepositorySnapshot", () => {
  it("captures the current HEAD and resolves the repository path", () => {
    const snapshot = captureRepositorySnapshot(relative(process.cwd(), repositoryRoot));

    expect(snapshot).toEqual({
      repositoryRoot,
      commitSha: git("rev-parse", "HEAD").trim(),
    });
    expect(git("status", "--porcelain")).toBe("");
  });

  it.each(["tracked", "staged", "untracked"])("rejects %s changes", (kind) => {
    makeDirty(kind);

    expect(() => captureRepositorySnapshot(repositoryRoot)).toThrow(
      "Cannot capture repository snapshot: repository has uncommitted or untracked changes.",
    );
  });
});

describe("assertRepositoryMatchesSnapshot", () => {
  it("accepts an unchanged, clean repository", () => {
    const snapshot = captureRepositorySnapshot(repositoryRoot);

    expect(() => assertRepositoryMatchesSnapshot(snapshot)).not.toThrow();
  });

  it("rejects a new HEAD even when the repository is clean", () => {
    const snapshot = captureRepositorySnapshot(repositoryRoot);
    git("commit", "--quiet", "--allow-empty", "-m", "new HEAD");

    expect(git("status", "--porcelain")).toBe("");
    expect(() => assertRepositoryMatchesSnapshot(snapshot)).toThrow(
      `Repository HEAD changed: expected ${snapshot.commitSha}, received ${git("rev-parse", "HEAD").trim()}.`,
    );
  });

  it.each(["tracked", "staged", "untracked"])("rejects a working tree with %s changes", (kind) => {
    const snapshot = captureRepositorySnapshot(repositoryRoot);
    makeDirty(kind);

    expect(() => assertRepositoryMatchesSnapshot(snapshot)).toThrow(
      "Repository working tree became dirty: uncommitted or untracked changes detected.",
    );
  });
});
