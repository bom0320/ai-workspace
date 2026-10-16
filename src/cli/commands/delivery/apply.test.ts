import { execFileSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, beforeEach, expect, it, vi } from "vitest";

import type { ExecutionResult } from "@/application/execution/index.js";

import { approveApply } from "../../prompts/delivery/index.js";
import { runApplyCommand } from "./apply.js";
vi.mock("../../prompts/delivery/index.js", () => ({ approveApply: vi.fn() }));
let root: string;
let artifacts: string;
let result: ExecutionResult;
const git = (...args: string[]) => execFileSync("git", args, { cwd: root, encoding: "utf8" });
beforeEach(() => {
  vi.clearAllMocks();
  vi.spyOn(console, "log").mockImplementation(() => {});
  root = mkdtempSync(join(tmpdir(), "apply-command-"));
  artifacts = mkdtempSync(join(tmpdir(), "apply-artifacts-"));
  git("init", "--quiet"); git("config", "user.name", "Test"); git("config", "user.email", "test@example.com");
  writeFileSync(join(root, "README.md"), "original\n"); git("add", "."); git("commit", "--quiet", "-m", "initial");
  writeFileSync(join(root, "README.md"), "updated\n");
  writeFileSync(join(artifacts, "changes.patch"), git("diff"));
  writeFileSync(join(root, "README.md"), "original\n");
  result = { passed: true, evidence: { verification: { passed: true, commands: [] } }, failures: [], artifacts: { directory: artifacts } };
});
afterEach(() => { vi.restoreAllMocks(); rmSync(root, { recursive: true, force: true }); rmSync(artifacts, { recursive: true, force: true }); });
it("applies verified changes only after separate approval", async () => {
  vi.mocked(approveApply).mockResolvedValue(true);
  expect(await runApplyCommand(root, result)).toEqual({ status: "applied" });
  expect(readFileSync(join(root, "README.md"), "utf8")).toBe("updated\n");
  expect(result.passed).toBe(true);
});
it("skips without changes and preserves the patch", async () => {
  vi.mocked(approveApply).mockResolvedValue(false);
  expect(await runApplyCommand(root, result)).toEqual({ status: "skipped" });
  expect(readFileSync(join(root, "README.md"), "utf8")).toBe("original\n");
  expect(existsSync(join(artifacts, "changes.patch"))).toBe(true);
});
it("blocks dirty originals without changing execution success", async () => {
  vi.mocked(approveApply).mockResolvedValue(true);
  writeFileSync(join(root, "human.txt"), "keep");
  expect(await runApplyCommand(root, result)).toMatchObject({ status: "blocked" });
  expect(result.passed).toBe(true);
  expect(readFileSync(join(root, "README.md"), "utf8")).toBe("original\n");
});
it.each(["execution", "verification", "preservation", "missing patch", "missing verification"])("does not prompt after %s failure", async (kind) => {
  if (kind === "execution" || kind === "preservation") result.passed = false;
  if (kind === "verification") result.evidence.verification!.passed = false;
  if (kind === "missing verification") delete result.evidence.verification;
  if (kind === "missing patch") rmSync(join(artifacts, "changes.patch"));
  await runApplyCommand(root, result);
  expect(approveApply).not.toHaveBeenCalled();
  expect(readFileSync(join(root, "README.md"), "utf8")).toBe("original\n");
});
it("reports patch failure separately and retains execution success and artifact", async () => {
  vi.mocked(approveApply).mockResolvedValue(true);
  writeFileSync(join(artifacts, "changes.patch"), "invalid");
  expect(await runApplyCommand(root, result)).toMatchObject({ status: "failed" });
  expect(result.passed).toBe(true);
  expect(existsSync(join(artifacts, "changes.patch"))).toBe(true);
  expect(readFileSync(join(root, "README.md"), "utf8")).toBe("original\n");
});
