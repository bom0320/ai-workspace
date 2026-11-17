import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { getWorkspaceChangedPaths } from "./changed-paths.js";

let root: string;
let base: string;
const git = (...args: string[]) =>
  execFileSync("git", args, {
    cwd: root,
    encoding: "utf8",
    stdio: "pipe",
  });
beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), "ai-workspace-changed-paths-"));
  git("init", "--quiet");
  git("config", "user.name", "Test");
  git("config", "user.email", "test@example.com");
  writeFileSync(join(root, "modified.txt"), "before\n");
  writeFileSync(join(root, "deleted.txt"), "delete me\n");
  writeFileSync(join(root, ".gitignore"), "ignored.log\n");
  git("add", ".");
  git("commit", "--quiet", "-m", "initial");
  base = git("rev-parse", "HEAD").trim();
});
afterEach(() => rmSync(root, { recursive: true, force: true }));

describe("getWorkspaceChangedPaths", () => {
  it("returns no changes for a clean repository and excludes ignored files", () => {
    expect(getWorkspaceChangedPaths(root, base)).toEqual([]);
    writeFileSync(join(root, "ignored.log"), "ignored\n");
    expect(getWorkspaceChangedPaths(root, base)).toEqual([]);
  });

  it("collects committed, staged, unstaged and untracked changes without changing the index", () => {
    writeFileSync(join(root, "modified.txt"), "worker commit\n");
    git("add", "modified.txt");
    git("commit", "--quiet", "-m", "worker");
    writeFileSync(join(root, "modified.txt"), "unstaged\n");
    git("rm", "deleted.txt");
    writeFileSync(join(root, "added.txt"), "staged\n");
    git("add", "added.txt");
    writeFileSync(join(root, "untracked.txt"), "untracked\n");
    const before = git("status", "--porcelain", "-z");
    const index = git("diff", "--cached", "--binary");
    expect(getWorkspaceChangedPaths(root, base)).toEqual([
      "added.txt",
      "deleted.txt",
      "modified.txt",
      "untracked.txt",
    ]);
    expect(git("status", "--porcelain", "-z")).toBe(before);
    expect(git("diff", "--cached", "--binary")).toBe(index);
  });

  it("deduplicates paths present in both Git outputs and sorts the result", () => {
    // A base-tracked file removed only from the index is also untracked.
    git("rm", "--cached", "modified.txt");
    writeFileSync(join(root, "z.txt"), "z");
    writeFileSync(join(root, "a.txt"), "a");
    expect(git("diff", "--name-only", "-z", base, "--")).toContain(
      "modified.txt\0"
    );
    expect(git("ls-files", "--others", "--exclude-standard", "-z")).toContain(
      "modified.txt\0"
    );
    expect(getWorkspaceChangedPaths(root, base)).toEqual([
      "a.txt",
      "modified.txt",
      "z.txt",
    ]);
  });

  it("preserves spaces, tabs, newlines, quotes and Unicode in null-delimited paths", () => {
    const paths = [
      "with spaces.txt",
      "tab\tname.txt",
      "line\nbreak.txt",
      'quote"name.txt',
      "한글.txt",
    ];
    paths.forEach((path) => writeFileSync(join(root, path), "data"));
    git("add", "--", paths[0], paths[1]);
    expect(getWorkspaceChangedPaths(root, base)).toEqual([...paths].sort());
  });

  it("propagates Git failures without attaching Execution Evidence meaning", () => {
    expect(() => getWorkspaceChangedPaths(root, "missing-base")).toThrow();
    try {
      getWorkspaceChangedPaths(root, "missing-base");
    } catch (error) {
      expect(error).toMatchObject({ status: 128 });
      expect((error as Error).message).not.toContain(
        "Failed to collect execution evidence"
      );
    }
    expect(git("status", "--porcelain")).toBe("");
  });
});
