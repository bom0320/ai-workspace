import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, beforeEach, expect, it } from "vitest";

import { isRepositoryClean } from "../repository/status.js";
import { applyPatch, PatchApplyError } from "./patch.js";

let root: string;
let patch: string;
const git = (...args: string[]) =>
  execFileSync("git", args, { cwd: root, encoding: "utf8" });
beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), "patch-repository-"));
  patch = join(tmpdir(), `patch-${root.split("/").at(-1)}.patch`);
  git("init", "--quiet");
  git("config", "user.name", "Test");
  git("config", "user.email", "test@example.com");
  writeFileSync(join(root, "README.md"), "original\n");
  git("add", ".");
  git("commit", "--quiet", "-m", "initial");
  writeFileSync(join(root, "README.md"), "updated\n");
  writeFileSync(patch, git("diff", "--binary"));
  writeFileSync(join(root, "README.md"), "original\n");
});
afterEach(() => {
  rmSync(root, { recursive: true, force: true });
  rmSync(patch, { force: true });
});
it.each(["tracked", "staged", "untracked"])(
  "detects %s changes and blocks apply",
  (kind) => {
    writeFileSync(
      join(root, kind === "untracked" ? "new.txt" : "README.md"),
      "human\n"
    );
    if (kind === "staged") git("add", ".");
    expect(isRepositoryClean(root)).toBe(false);
    expect(() => applyPatch(root, patch)).toThrow("uncommitted changes");
    expect(readFileSync(join(root, "README.md"), "utf8")).toBe(
      kind === "untracked" ? "original\n" : "human\n"
    );
  }
);
it("pre-checks and applies a valid patch while retaining the artifact", () => {
  expect(isRepositoryClean(root)).toBe(true);
  expect(() => git("apply", "--check", patch)).not.toThrow();
  applyPatch(root, patch);
  expect(readFileSync(join(root, "README.md"), "utf8")).toBe("updated\n");
  expect(readFileSync(patch, "utf8")).toContain("+updated");
});
it.each(["invalid", "conflicting"])(
  "rejects a %s patch without modifying the repository",
  (kind) => {
    if (kind === "invalid") writeFileSync(patch, "not a patch");
    else {
      writeFileSync(join(root, "README.md"), "different\n");
      git("add", ".");
      git("commit", "--quiet", "-m", "changed base");
    }
    const before = readFileSync(join(root, "README.md"), "utf8");
    expect(() => applyPatch(root, patch)).toThrow(PatchApplyError);
    expect(readFileSync(join(root, "README.md"), "utf8")).toBe(before);
    expect(isRepositoryClean(root)).toBe(true);
  }
);
