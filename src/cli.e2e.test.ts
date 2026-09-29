import { execFileSync, spawnSync } from "node:child_process";
import {
  chmodSync,
  existsSync,
  mkdtempSync,
  mkdirSync,
  readFileSync,
  realpathSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, delimiter, join, resolve } from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath, pathToFileURL } from "node:url";

import { describe, expect, it } from "vitest";

import type { ExecutionResult } from "./execution/execution-result.js";

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const cliPath = join(projectRoot, "src", "cli.ts");
const tsxImport = pathToFileURL(
  createRequire(import.meta.url).resolve("tsx"),
).href;

type Scenario =
  | "success"
  | "scope"
  | "worker-failure"
  | "worker-timeout"
  | "verification-failure"
  | "verification-timeout"
  | "worker-commit-allowed"
  | "worker-commit-forbidden"
  | "verification-scope";

type ScenarioResult = {
  status: number | null;
  stdout: string;
  stderr: string;
  verificationRan: boolean;
  storedResult: ExecutionResult;
  lateWorkerChange: boolean;
  lateVerificationChange: boolean;
};

function git(repositoryRoot: string, args: string[]): string {
  return execFileSync("git", ["-C", repositoryRoot, ...args], {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  });
}

function runScenario(scenario: Scenario): ScenarioResult {
  const temporaryRoot = mkdtempSync(join(tmpdir(), "ai-workspace-e2e-"));
  const repositoryRoot = join(temporaryRoot, "repository");
  const fakeBinRoot = join(temporaryRoot, "bin");
  const workerRecord = join(temporaryRoot, "worker-cwd.txt");
  const verificationRecord = join(temporaryRoot, "verification-cwd.txt");
  const lateWorkerRecord = join(temporaryRoot, "late-worker-change.txt");
  const lateVerificationRecord = join(
    temporaryRoot,
    "late-verification-change.txt",
  );
  const taskPath = join(temporaryRoot, "task.json");
  let workspaceRoot: string | undefined;

  try {
    mkdirSync(repositoryRoot);
    mkdirSync(fakeBinRoot);
    git(repositoryRoot, ["init"]);
    git(repositoryRoot, ["config", "user.name", "AI Workspace E2E"]);
    git(repositoryRoot, ["config", "user.email", "e2e@example.invalid"]);

    writeFileSync(join(repositoryRoot, "allowed.txt"), "original allowed\n");
    writeFileSync(
      join(repositoryRoot, "forbidden.txt"),
      "original forbidden\n"
    );
    writeFileSync(
      join(repositoryRoot, "verify.cjs"),
      [
        'const { spawn } = require("node:child_process");',
        'const { readFileSync, writeFileSync } = require("node:fs");',
        "writeFileSync(process.env.E2E_VERIFICATION_RECORD, process.cwd());",
        'if (process.env.E2E_SCENARIO === "verification-timeout") {',
        "  spawn(process.execPath, [",
        '    "-e",',
        '    `setTimeout(() => require("node:fs").writeFileSync(${JSON.stringify(process.env.E2E_LATE_VERIFICATION_RECORD)}, "late"), 1500)`,',
        '  ], { stdio: "ignore" });',
        "  setTimeout(() => {}, 5_000);",
        "}",
        'if (process.env.E2E_SCENARIO === "verification-scope") {',
        '  writeFileSync("forbidden.txt", "changed by verification\\n");',
        "  process.exit(0);",
        "}",
        'if (process.env.E2E_SCENARIO === "verification-failure") {',
        '  writeFileSync("verification-output.txt", "failed verification output\\n");',
        '  console.error("verification failed intentionally");',
        "  process.exit(9);",
        "}",
        'if (readFileSync("allowed.txt", "utf8") !== "changed by worker\\n") {',
        '  console.error("allowed.txt did not contain the Worker change");',
        "  process.exit(8);",
        "}",
      ].join("\n")
    );
    git(repositoryRoot, ["add", "."]);
    git(repositoryRoot, ["commit", "-m", "initial commit"]);

    const originalHead = git(repositoryRoot, ["rev-parse", "HEAD"]).trim();
    const originalAllowed = readFileSync(
      join(repositoryRoot, "allowed.txt"),
      "utf8"
    );
    const originalForbidden = readFileSync(
      join(repositoryRoot, "forbidden.txt"),
      "utf8"
    );
    const originalStatus = git(repositoryRoot, ["status", "--porcelain"]);
    const originalWorktrees = git(repositoryRoot, [
      "worktree",
      "list",
      "--porcelain",
    ]);

    const fakeCodexPath = join(fakeBinRoot, "codex");
    writeFileSync(
      fakeCodexPath,
      [
        `#!${process.execPath}`,
        'const { execFileSync, spawn } = require("node:child_process");',
        'const { writeFileSync } = require("node:fs");',
        'const { join } = require("node:path");',
        "writeFileSync(process.env.E2E_WORKER_RECORD, process.cwd());",
        'const target = ["scope", "worker-commit-forbidden"].includes(process.env.E2E_SCENARIO)',
        '  ? "forbidden.txt"',
        '  : "allowed.txt";',
        'writeFileSync(join(process.cwd(), target), "changed by worker\\n");',
        'if (process.env.E2E_SCENARIO === "worker-timeout") {',
        "  spawn(process.execPath, [",
        '    "-e",',
        '    `setTimeout(() => require("node:fs").writeFileSync(${JSON.stringify(process.env.E2E_LATE_WORKER_RECORD)}, "late"), 1500)`,',
        '  ], { stdio: "ignore" });',
        "  setTimeout(() => {}, 5_000);",
        "}",
        'if (process.env.E2E_SCENARIO === "worker-failure") {',
        '  console.error("fake Codex failed intentionally");',
        "  process.exit(7);",
        "}",
        'if (process.env.E2E_SCENARIO.startsWith("worker-commit-")) {',
        '  execFileSync("git", ["add", target]);',
        '  execFileSync("git", ["commit", "-m", "worker commit"]);',
        "}",
        'console.log("fake Codex completed");',
      ].join("\n")
    );
    chmodSync(fakeCodexPath, 0o755);

    const changedPath = ["scope", "worker-commit-forbidden"].includes(scenario)
      ? "forbidden.txt"
      : "allowed.txt";
    const allowedPaths = ["allowed.txt"];

    if (scenario === "verification-failure") {
      allowedPaths.push("verification-output.txt");
    }
    writeFileSync(
      taskPath,
      JSON.stringify(
        {
          id: `e2e-${scenario}`,
          goalId: "e2e-goal",
          objective: "Exercise the complete v0 execution flow",
          targetRepository: "temporary-repository",
          allowedPaths,
          forbiddenPaths: ["forbidden.txt"],
          constraints: ["Only make the requested test change"],
          acceptanceCriteria: [`${changedPath} is handled as expected`],
          verification: [`${JSON.stringify(process.execPath)} verify.cjs`],
        },
        null,
        2
      )
    );

    const cli = spawnSync(
      process.execPath,
      ["--import", tsxImport, cliPath, taskPath, repositoryRoot],
      {
        cwd: temporaryRoot,
        encoding: "utf8",
        timeout: 30_000,
        env: {
          ...process.env,
          PATH: `${fakeBinRoot}${delimiter}${process.env.PATH ?? ""}`,
          E2E_SCENARIO: scenario,
          E2E_WORKER_RECORD: workerRecord,
          E2E_VERIFICATION_RECORD: verificationRecord,
          E2E_LATE_WORKER_RECORD: lateWorkerRecord,
          E2E_LATE_VERIFICATION_RECORD: lateVerificationRecord,
          AI_WORKSPACE_WORKER_TIMEOUT_MS:
            scenario === "worker-timeout" ? "500" : "",
          AI_WORKSPACE_VERIFICATION_TIMEOUT_MS:
            scenario === "verification-timeout" ? "500" : "",
        },
      }
    );

    expect(cli.error).toBeUndefined();
    expect(cli.signal).toBeNull();
    expect(
      existsSync(workerRecord),
      `CLI stdout:\n${cli.stdout}\nCLI stderr:\n${cli.stderr}`,
    ).toBe(true);

    workspaceRoot = readFileSync(workerRecord, "utf8");
    expect(workspaceRoot).not.toBe(repositoryRoot);
    expect(workspaceRoot).not.toBe("");

    const artifactsMatch = cli.stdout.match(/^Run Artifacts: (.+)$/m);
    expect(artifactsMatch).not.toBeNull();
    const runDirectory = artifactsMatch?.[1];
    expect(runDirectory).toBeDefined();
    expect(
      runDirectory?.startsWith(
        join(realpathSync(temporaryRoot), ".ai-workspace", "runs"),
      ),
    ).toBe(true);
    expect(runDirectory?.startsWith(repositoryRoot)).toBe(false);
    expect(existsSync(join(runDirectory!, "changes.patch"))).toBe(true);
    expect(existsSync(join(runDirectory!, "task.json"))).toBe(true);
    expect(existsSync(join(runDirectory!, "result.json"))).toBe(true);
    expect(readFileSync(join(runDirectory!, "base-commit.txt"), "utf8").trim()).toBe(
      originalHead,
    );

    const storedResult = JSON.parse(
      readFileSync(join(runDirectory!, "result.json"), "utf8"),
    ) as ExecutionResult;
    expect(storedResult.passed).toBe(
      scenario === "success" || scenario === "worker-commit-allowed",
    );
    expect(storedResult.artifacts).toEqual({
      directory: runDirectory,
      baseCommit: originalHead,
    });

    const verificationRan = existsSync(verificationRecord);

    if (verificationRan) {
      expect(readFileSync(verificationRecord, "utf8")).toBe(workspaceRoot);
    }

    expect(git(repositoryRoot, ["rev-parse", "HEAD"]).trim()).toBe(
      originalHead
    );
    expect(readFileSync(join(repositoryRoot, "allowed.txt"), "utf8")).toBe(
      originalAllowed
    );
    expect(readFileSync(join(repositoryRoot, "forbidden.txt"), "utf8")).toBe(
      originalForbidden
    );
    expect(git(repositoryRoot, ["status", "--porcelain"])).toBe(originalStatus);
    expect(git(repositoryRoot, ["worktree", "list", "--porcelain"])).toBe(
      originalWorktrees
    );
    expect(existsSync(workspaceRoot)).toBe(false);
    expect(existsSync(runDirectory!)).toBe(true);

    if (
      scenario === "worker-timeout" ||
      scenario === "verification-timeout"
    ) {
      Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 1_700);
    }

    return {
      status: cli.status,
      stdout: cli.stdout,
      stderr: cli.stderr,
      verificationRan,
      storedResult,
      lateWorkerChange: existsSync(lateWorkerRecord),
      lateVerificationChange: existsSync(lateVerificationRecord),
    };
  } finally {
    try {
      // 앞선 assertion에서 중단됐더라도 기록된 작업 경로를 복구한다.
      if (!workspaceRoot && existsSync(workerRecord)) {
        workspaceRoot = readFileSync(workerRecord, "utf8");
      }

      if (workspaceRoot && existsSync(repositoryRoot)) {
        git(repositoryRoot, ["worktree", "remove", "--force", workspaceRoot]);
      }
    } catch {
      // 정리 실패가 원래 테스트 오류를 덮지 않도록 한다.
    } finally {
      rmSync(temporaryRoot, { force: true, recursive: true });
    }
  }
}

describe("CLI end-to-end execution", () => {
  it("completes an allowed change and successful Verification", () => {
    const result = runScenario("success");

    expect(result.status).toBe(0);
    expect(result.stdout).toContain("Task Contract: valid");
    expect(result.stdout).toContain("Codex Worker: complete");
    expect(result.stdout).toContain("Verification: passed");
    expect(result.stdout).toContain("Changed Paths: 1");
    expect(result.verificationRan).toBe(true);
    expect(result.storedResult.failures).toEqual([]);
  });

  it("rejects a forbidden change without running Verification", () => {
    const result = runScenario("scope");

    expect(result.status).toBe(1);
    expect(result.stderr).toContain("Scope: failed");
    expect(result.stderr).toContain("Scope violation: forbidden.txt");
    expect(result.verificationRan).toBe(false);
    expect(result.storedResult.evidence.changedPaths).toEqual([
      "forbidden.txt",
    ]);
    expect(result.storedResult.failures[0]?.stage).toBe("scope");
  });

  it("reports Worker failure without running Verification", () => {
    const result = runScenario("worker-failure");

    expect(result.status).toBe(1);
    expect(result.stderr).toContain("Error: Codex Worker failed:");
    expect(result.stderr).toContain("fake Codex failed intentionally");
    expect(result.verificationRan).toBe(false);
    expect(result.storedResult.evidence.changedPaths).toEqual(["allowed.txt"]);
    expect(result.storedResult.failures[0]?.stage).toBe("worker");
  });

  it("preserves partial Worker changes and stops child processes on timeout", () => {
    const result = runScenario("worker-timeout");

    expect(result.status).toBe(1);
    expect(result.stderr).toContain("Codex worker timed out after 500 ms.");
    expect(result.verificationRan).toBe(false);
    expect(result.storedResult.evidence.changedPaths).toEqual(["allowed.txt"]);
    expect(result.storedResult.failures[0]?.stage).toBe("worker");
    expect(result.lateWorkerChange).toBe(false);
  });

  it("reports an executed Verification command that fails", () => {
    const result = runScenario("verification-failure");

    expect(result.status).toBe(1);
    expect(result.stderr).toContain("Verification: failed");
    expect(result.stderr).toContain(
      `Failed command: ${JSON.stringify(
        process.execPath
      )} verify.cjs (exit code: 9)`
    );
    expect(result.verificationRan).toBe(true);
    expect(result.storedResult.evidence.verification?.passed).toBe(false);
    expect(result.storedResult.evidence.changedPaths).toEqual([
      "allowed.txt",
      "verification-output.txt",
    ]);
    expect(result.storedResult.failures[0]?.stage).toBe("verification");
  });

  it("preserves a Verification timeout and stops its child processes", () => {
    const result = runScenario("verification-timeout");

    expect(result.status).toBe(1);
    expect(result.stderr).toContain("Verification: failed");
    expect(result.verificationRan).toBe(true);
    expect(result.storedResult.evidence.verification?.commands[0]).toMatchObject(
      {
        passed: false,
        timedOut: true,
      },
    );
    expect(result.storedResult.evidence.verification?.commands[0]?.stderr).toContain(
      "Verification command timed out after 500 ms.",
    );
    expect(result.storedResult.failures[0]?.stage).toBe("verification");
    expect(result.lateVerificationChange).toBe(false);
  });

  it("includes an allowed Worker commit in changed paths", () => {
    const result = runScenario("worker-commit-allowed");

    expect(result.status).toBe(0);
    expect(result.storedResult.evidence.changedPaths).toEqual(["allowed.txt"]);
    expect(result.storedResult.scope).toEqual({ passed: true, violations: [] });
  });

  it("rejects a forbidden Worker commit before Verification", () => {
    const result = runScenario("worker-commit-forbidden");

    expect(result.status).toBe(1);
    expect(result.stderr).toContain("Scope violation: forbidden.txt");
    expect(result.verificationRan).toBe(false);
    expect(result.storedResult.evidence.changedPaths).toEqual([
      "forbidden.txt",
    ]);
  });

  it("rejects a forbidden file created by successful Verification", () => {
    const result = runScenario("verification-scope");

    expect(result.status).toBe(1);
    expect(result.verificationRan).toBe(true);
    expect(result.storedResult.evidence.verification?.passed).toBe(true);
    expect(result.storedResult.evidence.changedPaths).toEqual([
      "allowed.txt",
      "forbidden.txt",
    ]);
    expect(result.storedResult.scope).toEqual({
      passed: false,
      violations: ["forbidden.txt"],
    });
  });
});
