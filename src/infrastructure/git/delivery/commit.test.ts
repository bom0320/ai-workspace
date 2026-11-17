import { execFileSync } from "node:child_process";
import {
  mkdtempSync,
  mkdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, beforeEach, expect, it } from "vitest";

import { commitChanges, stagePaths } from "./commit.js";
let root: string;
const git = (...args: string[]) =>
  execFileSync("git", args, { cwd: root, encoding: "utf8", stdio: "pipe" });
beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), "delivery-commit-"));
  git("init", "--quiet");
  git("config", "user.name", "Test");
  git("config", "user.email", "test@example.com");
  writeFileSync(join(root, "README.md"), "original\n");
  git("add", ".");
  git("commit", "--quiet", "-m", "initial");
  writeFileSync(join(root, "README.md"), "updated\n");
  writeFileSync(join(root, "unrelated.txt"), "human\n");
});
afterEach(() => rmSync(root, { recursive: true, force: true }));
it("stages only changedPaths and commits without unrelated files", () => {
  stagePaths(root, ["README.md"]);
  expect(git("diff", "--cached", "--name-only").trim()).toBe("README.md");
  const sha = commitChanges(root, "docs: update README");
  expect(sha).toBe(git("rev-parse", "HEAD").trim());
  expect(git("show", "--format=", "--name-only", "HEAD").trim()).toBe(
    "README.md"
  );
  expect(readFileSync(join(root, "unrelated.txt"), "utf8")).toBe("human\n");
  expect(git("status", "--porcelain")).toContain("?? unrelated.txt");
});
it("blocks empty paths", () =>
  expect(() => stagePaths(root, [])).toThrow("non-empty"));
it("blocks previously staged unrelated changes", () => {
  git("add", "unrelated.txt");
  expect(() => stagePaths(root, ["README.md"])).toThrow(
    "Existing staged changes"
  );
  expect(git("diff", "--cached", "--name-only").trim()).toBe("unrelated.txt");
});
it("uses literal file paths rather than Git pathspec patterns", () => {
  writeFileSync(join(root, "literal*.txt"), "literal\n");
  stagePaths(root, ["literal*.txt"]);
  expect(git("diff", "--cached", "--name-only").trim()).toBe("literal*.txt");
});
it("reports commit failure and preserves changes", () => {
  expect(() => commitChanges(root, "docs: update README")).toThrow(
    "Unable to commit"
  );
  expect(readFileSync(join(root, "README.md"), "utf8")).toBe("updated\n");
});

it("blocks directory paths to avoid recursively staging unrelated files", () => {
  mkdirSync(join(root, "directory"));
  writeFileSync(join(root, "directory", "unrelated.txt"), "human");
  expect(() => stagePaths(root, ["directory"])).toThrow("file paths");
});
