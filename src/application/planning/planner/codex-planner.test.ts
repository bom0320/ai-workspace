import { existsSync, readdirSync } from "node:fs";

import { beforeEach, describe, expect, it, vi } from "vitest";
import { ZodError } from "zod";

import { runCommand } from "@/infrastructure/process/index.js";

import type { TaskDraft } from "../protocol/planner.js";
import * as projection from "../flow/transformation/create-planner-context.js";
import type { PlanningState } from "../model/state.js";
import { createCodexPlanner } from "./codex-planner.js";

vi.mock("@/infrastructure/process/index.js", () => ({ runCommand: vi.fn() }));

const runCommandMock = vi.mocked(runCommand);
const state: PlanningState = {
  goal: { objective: "Implement the goal", targetRepository: "example" },
  repository: {
    repositoryRoot: "/private/repositories/example",
    repositoryName: "example",
    fileTree: ["src/example.ts"],
    packageScripts: { test: "vitest run" },
    instructions: "Keep changes minimal",
  },
  inspectedFiles: [{ path: "src/example.ts", content: "// Example" }],
};
const task: TaskDraft = {
  objective: "Implement the goal",
  targetRepository: "example",
  allowedPaths: ["src/example.ts"],
  forbiddenPaths: [],
  constraints: [],
  acceptanceCriteria: ["The goal is implemented"],
  verification: ["pnpm test"],
};
const limits = { maxRounds: 4, maxFilesPerRequest: 5, maxTotalFiles: 12 };
const inspect = { type: "inspect", request: { paths: ["package.json"] } };

beforeEach(() => {
  vi.restoreAllMocks();
  runCommandMock.mockReset();
  runCommandMock.mockResolvedValue({
    stdout: JSON.stringify(inspect),
    stderr: "",
    exitCode: 0,
    timedOut: false,
  });
});

describe("createCodexPlanner", () => {
  it("prefers minimum-round completion without weakening inspection limits", async () => {
    await createCodexPlanner()(state, limits);
    const prompt = runCommandMock.mock.calls[0][1].at(-1)!;
    for (const rule of [
      "fewest planning rounds possible",
      "return complete immediately",
      "Do not inspect additional files merely for completeness",
      "only when they are necessary",
      "one focused inspect request",
      "within PlanningLimits",
    ])
      expect(prompt).toContain(rule);
  });
  it("shows actual Harness limits and the remaining budget with priority rules", async () => {
    const currentState = {
      ...state,
      inspectedFiles: Array.from({ length: 8 }, (_, i) => ({
        path: `file-${i}.ts`,
        content: "context",
      })),
    };
    await createCodexPlanner()(currentState, limits);
    const prompt = runCommandMock.mock.calls[0][1].at(-1)!;
    const context = JSON.parse(prompt.split("PlannerContext:\n")[1]);
    expect(context.limits).toEqual(limits);
    expect(context.remainingInspectionBudget).toBe(4);
    expect(prompt).toContain("max rounds: 4");
    expect(prompt).toContain("max files per inspect request: 5");
    expect(prompt).toContain("max total inspected files: 12");
    expect(prompt).toContain(
      "Already inspected: 8; remaining inspection budget: 4"
    );
    expect(prompt).toContain(
      "Never request more than maxFilesPerRequest paths"
    );
    expect(prompt).toContain(
      "Never exceed the remaining maxTotalFiles inspection budget"
    );
    expect(prompt).toContain("highest-priority files first");
    expect(prompt).toContain(
      "Additional files can be requested in later planning rounds"
    );
    expect(prompt).toContain(
      "Avoid requesting files already present in inspectedFiles"
    );
    expect(prompt).toContain("minimum repository context needed");
  });

  it("uses supplied non-default limits without hardcoding", async () => {
    const custom = { maxRounds: 2, maxFilesPerRequest: 1, maxTotalFiles: 3 };
    await createCodexPlanner()(state, custom);
    const prompt = runCommandMock.mock.calls[0][1].at(-1)!;
    expect(prompt).toContain("max files per inspect request: 1");
    expect(JSON.parse(prompt.split("PlannerContext:\n")[1])).toMatchObject({
      limits: custom,
      remainingInspectionBudget: 2,
    });
  });
  it("requires executable verification commands and explicitly prohibits prose", async () => {
    await createCodexPlanner()(state, limits);
    const prompt = runCommandMock.mock.calls[0][1].at(-1)!;
    expect(prompt).toContain(
      "Verification entries MUST be executable shell commands"
    );
    expect(prompt).toContain("runnable exactly as written");
    expect(prompt).toContain(
      "Do not put prose, explanations, or natural-language instructions"
    );
    for (const example of [
      "git diff --check",
      "pnpm typecheck",
      "pnpm test",
      "README 변경 내용을 검토한다",
      "git diff로 변경 내용을 확인한다",
      "git diff -- README.md로 변경 범위를 확인한다",
    ]) {
      expect(prompt).toContain(example);
    }
  });
  it("projects state into the prompt without repositoryRoot or internal paths", async () => {
    const createInput = vi.spyOn(projection, "createPlannerContext");
    const before = structuredClone(state);
    await createCodexPlanner()(state, limits);

    expect(createInput).toHaveBeenCalledWith(state, limits);
    const prompt = runCommandMock.mock.calls[0][1].at(-1)!;
    const input = JSON.parse(prompt.split("PlannerContext:\n")[1]);
    expect(input).toEqual(projection.createPlannerContext(state, limits));
    expect(prompt).not.toContain(state.repository.repositoryRoot);
    expect(prompt).not.toContain("repositoryRoot");
    expect(state).toEqual(before);
    expect(prompt).toContain("planning-only");
    expect(prompt).toContain("must not edit files");
    expect(prompt).toContain("execute repository commands");
    expect(prompt).toContain("must not assume file contents");
    expect(prompt).toContain("Return JSON only");
    expect(prompt).toContain("Do not include markdown fences");
    expect(prompt).toContain('"type":"inspect"');
    expect(prompt).toContain('"type":"complete"');
    expect(prompt).toContain("TaskDraft");
    expect(prompt).toContain("Do not generate id or goalId");
    expect(prompt).not.toContain('"id":');
    expect(prompt).not.toContain('"goalId":');
  });

  it("runs non-interactively with isolated cwd and disabled tools, then cleans up", async () => {
    runCommandMock.mockImplementation(async (_command, _args, options) => {
      expect(options.cwd).not.toBe(state.repository.repositoryRoot);
      expect(readdirSync(options.cwd)).toEqual([]);
      return {
        stdout: JSON.stringify(inspect),
        stderr: "",
        exitCode: 0,
        timedOut: false,
      };
    });
    await createCodexPlanner({ timeoutMs: 1234 })(state, limits);

    const [command, args, options] = runCommandMock.mock.calls[0];
    expect(command).toBe("codex");
    expect(args[0]).toBe("exec");
    for (const flag of [
      "--ignore-user-config",
      "--ignore-rules",
      "--strict-config",
      "--ephemeral",
      "--skip-git-repo-check",
    ]) {
      expect(args).toContain(flag);
    }
    expect(args[args.indexOf("--sandbox") + 1]).toBe("read-only");
    const features = args.find((arg) => arg.startsWith("features="))!;
    for (const name of [
      "shell_tool",
      "unified_exec",
      "view_image",
      "code_mode_host",
      "apps",
      "plugins",
      "browser_use",
      "computer_use",
      "multi_agent",
      "hooks",
    ]) {
      expect(features).toContain(`${name}=false`);
    }
    expect(args).toContain('web_search="disabled"');
    expect(args).toContain("project_doc_max_bytes=0");
    expect(options.timeoutMs).toBe(1234);
    expect(existsSync(options.cwd)).toBe(false);
  });

  it("returns a valid inspect decision from trimmed stdout", async () => {
    runCommandMock.mockResolvedValue({
      stdout: ` \n${JSON.stringify(inspect)}\n `,
      stderr: "",
      exitCode: 0,
      timedOut: false,
    });
    expect(await createCodexPlanner()(state, limits)).toEqual(inspect);
  });

  it("returns a validated complete decision", async () => {
    const decision = { type: "complete", task };
    runCommandMock.mockResolvedValue({
      stdout: JSON.stringify(decision),
      stderr: "",
      exitCode: 0,
      timedOut: false,
    });
    expect(await createCodexPlanner()(state, limits)).toEqual(decision);
  });

  it.each(["I think you should inspect...", "```json\n{}\n```", ""])(
    "rejects malformed JSON without attempting recovery: %j",
    async (stdout) => {
      runCommandMock.mockResolvedValue({
        stdout,
        stderr: "",
        exitCode: 0,
        timedOut: false,
      });
      await expect(createCodexPlanner()(state, limits)).rejects.toThrow(
        "Codex planner returned malformed JSON."
      );
      expect(existsSync(runCommandMock.mock.calls[0][2].cwd)).toBe(false);
    }
  );

  it.each([
    { type: "banana" },
    { type: "complete", task: { ...task, objective: "" } },
    { type: "inspect", request: { paths: [""] } },
  ])("rejects schema-invalid output: %j", async (decision) => {
    runCommandMock.mockResolvedValue({
      stdout: JSON.stringify(decision),
      stderr: "",
      exitCode: 0,
      timedOut: false,
    });
    await expect(createCodexPlanner()(state, limits)).rejects.toBeInstanceOf(
      ZodError
    );
  });

  it("throws on non-zero process exit", async () => {
    runCommandMock.mockResolvedValue({
      stdout: JSON.stringify(inspect),
      stderr: "Process failed",
      exitCode: 1,
      timedOut: false,
    });
    await expect(createCodexPlanner()(state, limits)).rejects.toThrow(
      "Failed to run Codex planner: Process failed"
    );
  });

  it("throws on executable failure and retains its cause", async () => {
    const error = new Error("spawn codex ENOENT");
    runCommandMock.mockResolvedValue({
      stdout: "",
      stderr: "",
      exitCode: null,
      timedOut: false,
      error,
    });
    await expect(createCodexPlanner()(state, limits)).rejects.toMatchObject({
      cause: error,
    });
  });

  it("throws on timeout even when stdout contains a valid decision", async () => {
    runCommandMock.mockResolvedValue({
      stdout: JSON.stringify(inspect),
      stderr: "",
      exitCode: 0,
      timedOut: true,
    });
    await expect(
      createCodexPlanner({ timeoutMs: 42 })(state, limits)
    ).rejects.toThrow("Codex planner timed out after 42 ms.");
  });

  it("propagates unexpected runner rejection and cleans up the working directory", async () => {
    const error = new Error("System failure");
    runCommandMock.mockRejectedValue(error);
    await expect(createCodexPlanner()(state, limits)).rejects.toBe(error);
    expect(existsSync(runCommandMock.mock.calls[0][2].cwd)).toBe(false);
  });
});
