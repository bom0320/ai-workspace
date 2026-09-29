import { execFileSync, spawnSync } from "node:child_process";
import {
  chmodSync,
  existsSync,
  mkdtempSync,
  mkdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, delimiter, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const cliPath = join(projectRoot, "src", "cli.ts");

type Scenario = "success" | "scope" | "worker-failure" | "verification-failure";

type ScenarioResult = {
  status: number | null;
  stdout: string;
  stderr: string;
  verificationRan: boolean;
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
        'const { readFileSync, writeFileSync } = require("node:fs");',
        "writeFileSync(process.env.E2E_VERIFICATION_RECORD, process.cwd());",
        'if (process.env.E2E_SCENARIO === "verification-failure") {',
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
        'const { writeFileSync } = require("node:fs");',
        'const { join } = require("node:path");',
        "writeFileSync(process.env.E2E_WORKER_RECORD, process.cwd());",
        'if (process.env.E2E_SCENARIO === "worker-failure") {',
        '  console.error("fake Codex failed intentionally");',
        "  process.exit(7);",
        "}",
        'const target = process.env.E2E_SCENARIO === "scope"',
        '  ? "forbidden.txt"',
        '  : "allowed.txt";',
        'writeFileSync(join(process.cwd(), target), "changed by worker\\n");',
        'console.log("fake Codex completed");',
      ].join("\n")
    );
    chmodSync(fakeCodexPath, 0o755);

    const changedPath = scenario === "scope" ? "forbidden.txt" : "allowed.txt";
    writeFileSync(
      taskPath,
      JSON.stringify(
        {
          id: `e2e-${scenario}`,
          goalId: "e2e-goal",
          objective: "Exercise the complete v0 execution flow",
          targetRepository: "temporary-repository",
          allowedPaths: ["allowed.txt"],
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
      ["--import", "tsx", cliPath, taskPath, repositoryRoot],
      {
        cwd: projectRoot,
        encoding: "utf8",
        timeout: 30_000,
        env: {
          ...process.env,
          PATH: `${fakeBinRoot}${delimiter}${process.env.PATH ?? ""}`,
          E2E_SCENARIO: scenario,
          E2E_WORKER_RECORD: workerRecord,
          E2E_VERIFICATION_RECORD: verificationRecord,
        },
      }
    );

    expect(cli.error).toBeUndefined();
    expect(cli.signal).toBeNull();
    expect(existsSync(workerRecord)).toBe(true);

    workspaceRoot = readFileSync(workerRecord, "utf8");
    expect(workspaceRoot).not.toBe(repositoryRoot);
    expect(workspaceRoot).not.toBe("");

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

    return {
      status: cli.status,
      stdout: cli.stdout,
      stderr: cli.stderr,
      verificationRan,
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
  });

  it("rejects a forbidden change without running Verification", () => {
    const result = runScenario("scope");

    expect(result.status).toBe(1);
    expect(result.stderr).toContain("Scope: failed");
    expect(result.stderr).toContain("Scope violation: forbidden.txt");
    expect(result.verificationRan).toBe(false);
  });

  it("reports Worker failure without running Verification", () => {
    const result = runScenario("worker-failure");

    expect(result.status).toBe(1);
    expect(result.stderr).toContain("Error: Codex Worker failed:");
    expect(result.stderr).toContain("fake Codex failed intentionally");
    expect(result.verificationRan).toBe(false);
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
  });
});
