import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import type { ExecutionResult } from "@/application/execution/index.js";
import { approveApply } from "../../prompts/delivery/apply-changes.js";
import { approveCommit, askCommitMessage, approvePush } from "../../prompts/delivery/delivery.js";
import { runPostExecutionDelivery } from "./delivery.js";
vi.mock("../../prompts/delivery/apply-changes.js", () => ({ approveApply: vi.fn() }));
vi.mock("../../prompts/delivery/delivery.js", () => ({ approveCommit: vi.fn(), askCommitMessage: vi.fn(), approvePush: vi.fn() }));
let root: string;
let artifacts: string;
let execution: ExecutionResult;
let originalSha: string;
const git = (...args: string[]) => execFileSync("git", args, { cwd: root, encoding: "utf8", stdio: "pipe" });
const deliver = () => runPostExecutionDelivery({ repositoryRoot: root, executionResult: execution });
beforeEach(() => {
  vi.resetAllMocks(); vi.spyOn(console, "log").mockImplementation(() => {});
  root = mkdtempSync(join(tmpdir(), "delivery-repo-")); artifacts = mkdtempSync(join(tmpdir(), "delivery-artifacts-"));
  git("init", "--quiet", "--initial-branch=delivery"); git("config", "user.name", "Test"); git("config", "user.email", "test@example.com");
  writeFileSync(join(root, "README.md"), "original\n"); git("add", "."); git("commit", "--quiet", "-m", "initial"); originalSha = git("rev-parse", "HEAD").trim();
  writeFileSync(join(root, "README.md"), "updated\n"); writeFileSync(join(artifacts, "changes.patch"), git("diff")); writeFileSync(join(root, "README.md"), "original\n");
  execution = { passed: true, evidence: { changedPaths: ["README.md"], verification: { passed: true, commands: [] } }, failures: [], artifacts: { directory: artifacts } };
  vi.mocked(approveApply).mockResolvedValue(true); vi.mocked(approveCommit).mockResolvedValue(true); vi.mocked(askCommitMessage).mockResolvedValue("docs: update README"); vi.mocked(approvePush).mockResolvedValue(false);
});
afterEach(() => { vi.restoreAllMocks(); rmSync(root, { force: true, recursive: true }); rmSync(artifacts, { force: true, recursive: true }); });
it.each(["skip", "failure"])("does not prompt for Commit after Apply %s", async (kind) => {
  if (kind === "skip") vi.mocked(approveApply).mockResolvedValue(false);
  else writeFileSync(join(artifacts, "changes.patch"), "invalid");
  await deliver(); expect(approveCommit).not.toHaveBeenCalled(); expect(approvePush).not.toHaveBeenCalled(); expect(execution.passed).toBe(true);
});
it("keeps working tree edits on Commit Skip without a Push prompt", async () => {
  vi.mocked(approveCommit).mockResolvedValue(false);
  expect(await deliver()).toMatchObject({ apply: { status: "applied" }, commit: { status: "skipped" } });
  expect(approvePush).not.toHaveBeenCalled(); expect(askCommitMessage).not.toHaveBeenCalled(); expect(git("rev-parse", "HEAD").trim()).toBe(originalSha);
  expect(readFileSync(join(root, "README.md"), "utf8")).toBe("updated\n");
});
it("commits valid messages and preserves local commit on Push Skip", async () => {
  const result = await deliver(); expect(result.commit).toMatchObject({ status: "committed", commitSha: git("rev-parse", "HEAD").trim() }); expect(result.push).toEqual({ status: "skipped" });
  expect(git("rev-parse", "HEAD").trim()).not.toBe(originalSha); expect(execution.passed).toBe(true);
});
it("blocks invalid messages without commit or Push prompt", async () => {
  vi.mocked(askCommitMessage).mockResolvedValue("hello"); expect((await deliver()).commit?.status).toBe("blocked");
  expect(git("rev-parse", "HEAD").trim()).toBe(originalSha); expect(approvePush).not.toHaveBeenCalled();
});
it("blocks missing changedPaths", async () => {
  delete execution.evidence.changedPaths; expect((await deliver()).commit?.status).toBe("blocked"); expect(approvePush).not.toHaveBeenCalled();
});
it("stops on commit failure without modifying ExecutionResult", async () => {
  git("config", "user.name", ""); expect((await deliver()).commit?.status).toBe("failed"); expect(approvePush).not.toHaveBeenCalled(); expect(execution.passed).toBe(true);
});
it("blocks missing upstream and preserves commit", async () => {
  vi.mocked(approvePush).mockResolvedValue(true); expect((await deliver()).push?.status).toBe("blocked");
  expect(git("rev-parse", "HEAD").trim()).not.toBe(originalSha); expect(execution.passed).toBe(true);
});
it.each(["success", "failure"])("handles Push %s against real bare remote without changing ExecutionResult", async (kind) => {
  const remote = join(artifacts, "remote.git"); git("init", "--bare", "--quiet", remote); git("remote", "add", "origin", remote); git("push", "--set-upstream", "origin", "delivery");
  if (kind === "failure") git("config", "remote.origin.pushurl", join(artifacts, "missing.git"));
  vi.mocked(approvePush).mockResolvedValue(true);
  const result = await deliver(); expect(result.push?.status).toBe(kind === "success" ? "pushed" : "failed");
  const head = git("rev-parse", "HEAD").trim(); expect(head).not.toBe(originalSha); expect(execution.passed).toBe(true);
  expect(git("--git-dir", remote, "rev-parse", "refs/heads/delivery").trim()).toBe(kind === "success" ? head : originalSha);
});
