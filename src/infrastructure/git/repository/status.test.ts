import { execFileSync } from "node:child_process";
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { isRepositoryClean } from "./status.js";

let root: string;
const git = (...args: string[]) =>
  execFileSync("git", args, { cwd: root, encoding: "utf8", stdio: "pipe" });

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), "ai-workspace-repository-status-"));
  git("init", "--quiet");
  git("config", "user.name", "Test");
  git("config", "user.email", "test@example.com");
  writeFileSync(join(root, "README.md"), "original\n");
  writeFileSync(join(root, ".gitignore"), "ignored.log\n");
  git("add", ".");
  git("commit", "--quiet", "-m", "initial");
});

afterEach(() => rmSync(root, { recursive: true, force: true }));

describe("isRepositoryClean", () => {
  it("detects clean repositories", () => {
    expect(isRepositoryClean(root)).toBe(true);
  });

  it.each(["tracked", "staged", "untracked", "nested-untracked"])(
    "detects %s changes without modifying the working tree or index",
    (kind) => {
      let path = "README.md";
      if (kind === "untracked") path = "new.txt";
      if (kind === "nested-untracked") {
        mkdirSync(join(root, "nested"));
        path = "nested/new.txt";
      }
      writeFileSync(join(root, path), "changed\n");
      if (kind === "staged") git("add", "README.md");
      const before = git("status", "--porcelain", "--untracked-files=all");
      const staged = git("diff", "--cached");

      expect(isRepositoryClean(root)).toBe(false);
      expect(git("status", "--porcelain", "--untracked-files=all")).toBe(
        before
      );
      expect(git("diff", "--cached")).toBe(staged);
    }
  );

  it("preserves the existing ignored-file semantics", () => {
    writeFileSync(join(root, "ignored.log"), "ignored content\n");
    expect(isRepositoryClean(root)).toBe(true);
  });

  it("propagates the original process error for an inaccessible repository", () => {
    expect(() => isRepositoryClean(join(root, "missing"))).toThrow();
    try {
      isRepositoryClean(join(root, "missing"));
    } catch (error) {
      expect(error).toMatchObject({ code: "ENOENT", syscall: "spawnSync git" });
    }
  });
});
