import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, beforeEach, expect, it } from "vitest";

import { getWorkspaceDiff } from "./workspace-diff.js";
let root: string;
let base: string;
const git = (...args: string[]) => execFileSync("git", args, { cwd: root, encoding: "utf8", stdio: "pipe" });
beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), "review-diff-test-"));
  git("init", "--quiet"); git("config", "user.name", "Test"); git("config", "user.email", "test@example.com");
  writeFileSync(join(root, "README.md"), "original\n"); git("add", "."); git("commit", "--quiet", "-m", "initial"); base = git("rev-parse", "HEAD").trim();
});
afterEach(() => rmSync(root, { recursive: true, force: true }));
it("includes Worker commits, unstaged and new files without changing the real index", () => {
  writeFileSync(join(root, "README.md"), "committed by worker\n"); git("add", "README.md"); git("commit", "--quiet", "-m", "worker change");
  writeFileSync(join(root, "README.md"), "current workspace\n"); writeFileSync(join(root, "new.txt"), "new file\n");
  const before = git("status", "--porcelain");
  const diff = getWorkspaceDiff(root, base);
  expect(diff.content).toContain("+current workspace"); expect(diff.content).toContain("+new file"); expect(diff.content).toContain("-original"); expect(diff.truncated).toBe(false);
  expect(git("status", "--porcelain")).toBe(before); expect(git("diff", "--cached")).toBe("");
});
it("bounds large diff output and marks truncation", () => {
  writeFileSync(join(root, "README.md"), "new line\n".repeat(20_000));
  const diff = getWorkspaceDiff(root, base);
  expect(diff.truncated).toBe(true); expect(Buffer.byteLength(diff.content)).toBeLessThanOrEqual(64 * 1024);
});
it("propagates Git errors without changing repository state", () => {
  expect(() => getWorkspaceDiff(root, "missing-base")).toThrow(); expect(git("status", "--porcelain")).toBe("");
});
