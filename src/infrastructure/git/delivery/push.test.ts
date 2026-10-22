import { execFileSync } from "node:child_process";
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, beforeEach, expect, it } from "vitest";

import { getCurrentBranch, pushCurrentBranch } from "./push.js";
let temporaryRoot: string;
let root: string;
let remote: string;
const git = (...args: string[]) =>
  execFileSync("git", args, { cwd: root, encoding: "utf8", stdio: "pipe" });
beforeEach(() => {
  temporaryRoot = mkdtempSync(join(tmpdir(), "delivery-push-"));
  root = join(temporaryRoot, "repo");
  remote = join(temporaryRoot, "remote.git");
  mkdirSync(root);
  git("init", "--quiet", "--initial-branch=delivery");
  git("config", "user.name", "Test");
  git("config", "user.email", "test@example.com");
  writeFileSync(join(root, "README.md"), "original\n");
  git("add", ".");
  git("commit", "--quiet", "-m", "initial");
  git("init", "--bare", "--quiet", remote);
  git("remote", "add", "origin", remote);
});
afterEach(() => rmSync(temporaryRoot, { recursive: true, force: true }));
it("identifies current branch", () =>
  expect(getCurrentBranch(root)).toBe("delivery"));
it("blocks detached HEAD", () => {
  git("checkout", "--detach");
  expect(() =>
    pushCurrentBranch(root, git("rev-parse", "HEAD").trim())
  ).toThrow("detached HEAD");
});
it("blocks missing upstream", () =>
  expect(() =>
    pushCurrentBranch(root, git("rev-parse", "HEAD").trim())
  ).toThrow("upstream"));
it("blocks missing remotes", () => {
  git("remote", "remove", "origin");
  expect(() =>
    pushCurrentBranch(root, git("rev-parse", "HEAD").trim())
  ).toThrow("upstream");
});
it("pushes only the delivery branch to existing upstream", () => {
  git("push", "--set-upstream", "origin", "delivery");
  writeFileSync(join(root, "README.md"), "updated\n");
  git("add", "README.md");
  git("commit", "--quiet", "-m", "docs: update README");
  const sha = git("rev-parse", "HEAD").trim();
  // These settings must not broaden the delivery to other branches.
  git("config", "push.default", "matching");
  git("config", "remote.origin.push", "+refs/heads/*:refs/heads/*");
  git("branch", "unrelated");
  pushCurrentBranch(root, sha);
  expect(
    git("--git-dir", remote, "rev-parse", "refs/heads/delivery").trim()
  ).toBe(sha);
  expect(
    git("--git-dir", remote, "for-each-ref", "--format=%(refname)")
  ).not.toContain("unrelated");
});
it("rejects divergent remote without force and preserves local commit", () => {
  git("push", "--set-upstream", "origin", "delivery");
  const base = git("rev-parse", "HEAD").trim();
  writeFileSync(join(root, "README.md"), "local\n");
  git("add", ".");
  git("commit", "--quiet", "-m", "docs: local");
  const sha = git("rev-parse", "HEAD").trim();
  const tree = git("rev-parse", `${base}^{tree}`).trim();
  const divergent = execFileSync(
    "git",
    ["commit-tree", tree, "-p", base, "-m", "remote change"],
    { cwd: root, encoding: "utf8" }
  ).trim();
  git("push", "origin", `${divergent}:refs/heads/delivery`);
  expect(() => pushCurrentBranch(root, sha)).toThrow("Unable to push");
  expect(git("rev-parse", "HEAD").trim()).toBe(sha);
  expect(
    git("--git-dir", remote, "rev-parse", "refs/heads/delivery").trim()
  ).toBe(divergent);
});
it("blocks missing or mismatching delivery commits", () => {
  expect(() => pushCurrentBranch(root, "")).toThrow("delivery commit");
  expect(() => pushCurrentBranch(root, "different")).toThrow("delivery commit");
});
