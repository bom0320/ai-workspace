import { execFileSync, spawn, spawnSync } from "node:child_process";
import { chmodSync, existsSync, mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { delimiter, dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

import { expect, it } from "vitest";

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const tsxImport = pathToFileURL(createRequire(import.meta.url).resolve("tsx")).href;

async function runScenario(scenario: "success" | "invalid-evidence" | "dirty", interactive = false) {
  const temporaryRoot = mkdtempSync(join(tmpdir(), "ai-workspace-decision-e2e-"));
  const repositoryRoot = join(temporaryRoot, "repository");
  const bin = join(temporaryRoot, "bin");
  const record = join(temporaryRoot, "calls.jsonl");
  const git = (...args: string[]) => execFileSync("git", args, { cwd: repositoryRoot, encoding: "utf8", stdio: "pipe" });
  try {
    mkdirSync(repositoryRoot);
    mkdirSync(bin);
    git("init", "--quiet");
    git("config", "user.name", "Test");
    git("config", "user.email", "test@example.com");
    writeFileSync(join(repositoryRoot, "button.tsx"), "// committed button\n");
    git("add", ".");
    git("commit", "--quiet", "-m", "initial");
    const head = git("rev-parse", "HEAD").trim();
    if (scenario === "dirty") writeFileSync(join(repositoryRoot, "button.tsx"), "dirty\n");
    const fakeCodex = join(bin, "codex");
    writeFileSync(fakeCodex, [
      `#!${process.execPath}`,
      'const { appendFileSync } = require("node:fs");',
      'const prompt = process.argv.at(-1);',
      'const context = JSON.parse(prompt.split("SpecialistContext:\\n")[1]);',
      'const specialist = JSON.parse(prompt.split("Specialist role and objective:\\n")[1].split("\\nSpecialistContext:")[0]);',
      'appendFileSync(process.env.DECISION_E2E_RECORD, JSON.stringify({ cwd: process.cwd(), context, role: specialist.role, prompt }) + "\\n");',
      'console.log(JSON.stringify({ recommendation: specialist.role + " independent finding", evidence: [{ path: process.env.DECISION_E2E_SCENARIO === "invalid-evidence" ? "missing.ts" : context.files[0].path, lineStart: 1, description: "Supplied observation" }], risks: [], uncertainty: [] }));',
    ].join("\n"));
    chmodSync(fakeCodex, 0o755);
    const args = ["--import", tsxImport, join(projectRoot, "src/cli/cli.ts"),
      ...(interactive ? [] : ["decision", repositoryRoot, "Evaluate the button", "button.tsx"])];
    const options = {
      cwd: projectRoot,
      env: { ...process.env, TSX_TSCONFIG_PATH: join(projectRoot, "tsconfig.json"), PATH: `${bin}${delimiter}${process.env.PATH ?? ""}`,
        DECISION_E2E_RECORD: record, DECISION_E2E_SCENARIO: scenario },
    };
    const result = interactive
      ? await new Promise<{ stdout: string; stderr: string; status: number | null; error?: Error }>((resolveResult, reject) => {
        const child = spawn(process.execPath, args, options);
        let stdout = "";
        let stderr = "";
        let step = 0;
        const timer = setTimeout(() => { child.kill(); reject(new Error("Interactive Decision CLI timed out")); }, 20_000);
        child.stdout.on("data", (chunk) => {
          stdout += chunk.toString();
          if (step === 0 && stdout.includes("4. Execute existing task")) {
            step = 1;
            child.stdin.write("3\n");
          }
          if (step === 1 && stdout.includes("Repository:\n>")) {
            step = 2;
            child.stdin.write(`${repositoryRoot}\n`);
          }
          if (step === 2 && stdout.includes("Decision Goal:\n>")) {
            step = 3;
            child.stdin.write("Evaluate the button\n");
          }
          if (step === 3 && stdout.includes("Submit an empty line when finished.")) {
            step = 4;
            child.stdin.end("button.tsx\n\n");
          }
        });
        child.stderr.on("data", (chunk) => { stderr += chunk.toString(); });
        child.once("error", (error) => { clearTimeout(timer); reject(error); });
        child.once("close", (status) => { clearTimeout(timer); resolveResult({ stdout, stderr, status }); });
      })
      : spawnSync(process.execPath, args, { ...options, encoding: "utf8", timeout: 20_000 });
    const calls = existsSync(record) ? readFileSync(record, "utf8").trim().split("\n").map((line) => JSON.parse(line)) : [];
    for (const call of calls) {
      expect(call.cwd).not.toBe(repositoryRoot);
      expect(existsSync(call.cwd)).toBe(false);
    }
    expect(git("rev-parse", "HEAD").trim()).toBe(head);
    return { ...result, calls, head, statusAfter: git("status", "--porcelain") };
  } finally {
    rmSync(temporaryRoot, { recursive: true, force: true });
  }
}

it("runs the real decision CLI through two independent Specialists and validated Evidence", async () => {
  const result = await runScenario("success");
  expect(result.error).toBeUndefined();
  expect(result.status).toBe(0);
  expect(result.stderr).toBe("");
  expect(result.stdout).toContain(`Snapshot: ${result.head}`);
  expect(result.stdout).toContain("[Frontend Specialist]");
  expect(result.stdout).toContain("[UX Specialist]");
  expect(result.stdout).toContain("button.tsx:1");
  expect(result.stdout).toContain("Decision Duration:");
  expect(result.calls.map((call) => call.role)).toEqual(["Frontend Specialist", "UX Specialist"]);
  for (const call of result.calls) {
    expect(call.context).toEqual({ goal: { objective: "Evaluate the button", targetRepository: "repository" },
      repositoryCommitSha: result.head, files: [{ path: "button.tsx", content: "// committed button\n" }] });
  }
  expect(result.calls[1].prompt).not.toContain("Frontend Specialist independent finding");
  expect(result.statusAfter).toBe("");
}, 30_000);

it("fails before the next Specialist or result presentation on invalid Evidence", async () => {
  const result = await runScenario("invalid-evidence");
  expect(result.status).toBe(1);
  expect(result.stderr).toContain("Evidence path was not supplied to the Specialist");
  expect(result.calls).toHaveLength(1);
  expect(result.stdout).not.toContain("Recommendation:");
  expect(result.statusAfter).toBe("");
}, 30_000);

it("rejects a dirty repository before starting Codex", async () => {
  const result = await runScenario("dirty");
  expect(result.status).toBe(1);
  expect(result.stderr).toContain("uncommitted or untracked changes");
  expect(result.calls).toHaveLength(0);
  expect(result.statusAfter).toContain("button.tsx");
}, 30_000);


it("selects Decision from the interactive menu, collects Context and prints both results with one title", async () => {
  const result = await runScenario("success", true);
  expect(result.status).toBe(0);
  expect(result.stderr).toBe("");
  expect(result.stdout.match(/AI Workspace/g)).toHaveLength(1);
  expect(result.stdout).toContain("Select workflow:");
  expect(result.stdout).toContain("Decision Goal:");
  expect(result.stdout).toContain("Context Files");
  expect(result.stdout).toContain("[Frontend Specialist]");
  expect(result.stdout).toContain("[UX Specialist]");
  expect(result.calls.map((call) => call.role)).toEqual(["Frontend Specialist", "UX Specialist"]);
  expect(result.statusAfter).toBe("");
}, 30_000);
