import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { collectChangedPaths } from "./execution-evidence.js";

const temporaryDirectories: string[] = [];

function createGitRepository(): string {
  const repository = mkdtempSync(join(tmpdir(), "ai-workspace-evidence-"));

  temporaryDirectories.push(repository);
  execFileSync("git", ["init", "--quiet", repository]);
  writeFileSync(join(repository, "modified.txt"), "original\n");
  writeFileSync(join(repository, "deleted.txt"), "delete me\n");
  writeFileSync(join(repository, "file with spaces.txt"), "original\n");
  execFileSync("git", ["-C", repository, "add", "."]);
  execFileSync(
    "git",
    ["-C", repository, "commit", "--quiet", "-m", "initial"],
    {
      env: {
        ...process.env,
        GIT_AUTHOR_NAME: "Test User",
        GIT_AUTHOR_EMAIL: "test@example.com",
        GIT_COMMITTER_NAME: "Test User",
        GIT_COMMITTER_EMAIL: "test@example.com",
      },
    },
  );

  return repository;
}

afterEach(() => {
  for (const directory of temporaryDirectories.splice(0)) {
    rmSync(directory, { force: true, recursive: true });
  }
});

describe("collectChangedPaths", () => {
  it("returns an empty array when the workspace has no changes", () => {
    expect(collectChangedPaths(createGitRepository())).toEqual([]);
  });

  it("detects a modified tracked file", () => {
    const repository = createGitRepository();

    writeFileSync(join(repository, "modified.txt"), "changed\n");

    expect(collectChangedPaths(repository)).toEqual(["modified.txt"]);
  });

  it("detects a new untracked file", () => {
    const repository = createGitRepository();

    writeFileSync(join(repository, "untracked.txt"), "new\n");

    expect(collectChangedPaths(repository)).toEqual(["untracked.txt"]);
  });

  it("detects a deleted tracked file", () => {
    const repository = createGitRepository();

    rmSync(join(repository, "deleted.txt"));

    expect(collectChangedPaths(repository)).toEqual(["deleted.txt"]);
  });

  it("returns all changed paths without duplicates in sorted order", () => {
    const repository = createGitRepository();

    rmSync(join(repository, "deleted.txt"));
    writeFileSync(join(repository, "modified.txt"), "changed\n");
    writeFileSync(join(repository, "added.txt"), "staged addition\n");
    writeFileSync(join(repository, "untracked.txt"), "untracked\n");
    execFileSync("git", ["-C", repository, "add", "added.txt"]);

    expect(collectChangedPaths(repository)).toEqual([
      "added.txt",
      "deleted.txt",
      "modified.txt",
      "untracked.txt",
    ]);
  });

  it("preserves paths containing spaces", () => {
    const repository = createGitRepository();

    writeFileSync(join(repository, "file with spaces.txt"), "changed\n");

    expect(collectChangedPaths(repository)).toEqual(["file with spaces.txt"]);
  });

  it("reports Git failures with Evidence context", () => {
    const directory = mkdtempSync(join(tmpdir(), "ai-workspace-not-git-"));

    temporaryDirectories.push(directory);

    expect(() => collectChangedPaths(directory)).toThrow(
      "Failed to collect execution evidence",
    );
  });
});
