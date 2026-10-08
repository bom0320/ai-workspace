import { existsSync, readdirSync } from "node:fs";

import { beforeEach, describe, expect, it, vi } from "vitest";
import { ZodError } from "zod";

import { runCommand } from "@/infrastructure/process/index.js";
import type { TaskDraft } from "../protocol/planner.js";

import * as projection from "../flow/create-planner-context.js";
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
  targetRepository: "example", allowedPaths: ["src/example.ts"],
  forbiddenPaths: [], constraints: [], acceptanceCriteria: ["The goal is implemented"],
  verification: ["pnpm test"],
};
const inspect = { type: "inspect", request: { paths: ["package.json"] } };

beforeEach(() => {
  vi.restoreAllMocks();
  runCommandMock.mockReset();
  runCommandMock.mockResolvedValue({
    stdout: JSON.stringify(inspect), stderr: "", exitCode: 0, timedOut: false,
  });
});

describe("createCodexPlanner", () => {
  it("projects state into the prompt without repositoryRoot or internal paths", async () => {
    const createInput = vi.spyOn(projection, "createPlannerContext");
    const before = structuredClone(state);
    await createCodexPlanner()(state);

    expect(createInput).toHaveBeenCalledWith(state);
    const prompt = runCommandMock.mock.calls[0][1].at(-1)!;
    const input = JSON.parse(prompt.split("PlannerContext:\n")[1]);
    expect(input).toEqual(projection.createPlannerContext(state));
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
      return { stdout: JSON.stringify(inspect), stderr: "", exitCode: 0, timedOut: false };
    });
    await createCodexPlanner({ timeoutMs: 1234 })(state);

    const [command, args, options] = runCommandMock.mock.calls[0];
    expect(command).toBe("codex");
    expect(args[0]).toBe("exec");
    for (const flag of ["--ignore-user-config", "--ignore-rules", "--strict-config", "--ephemeral", "--skip-git-repo-check"]) {
      expect(args).toContain(flag);
    }
    expect(args[args.indexOf("--sandbox") + 1]).toBe("read-only");
    const features = args.find((arg) => arg.startsWith("features="))!;
    for (const name of ["shell_tool", "unified_exec", "view_image", "code_mode_host", "apps", "plugins", "browser_use", "computer_use", "multi_agent", "hooks"]) {
      expect(features).toContain(`${name}=false`);
    }
    expect(args).toContain('web_search="disabled"');
    expect(args).toContain("project_doc_max_bytes=0");
    expect(options.timeoutMs).toBe(1234);
    expect(existsSync(options.cwd)).toBe(false);
  });

  it("returns a valid inspect decision from trimmed stdout", async () => {
    runCommandMock.mockResolvedValue({ stdout: ` \n${JSON.stringify(inspect)}\n `, stderr: "", exitCode: 0, timedOut: false });
    expect(await createCodexPlanner()(state)).toEqual(inspect);
  });

  it("returns a validated complete decision", async () => {
    const decision = { type: "complete", task };
    runCommandMock.mockResolvedValue({ stdout: JSON.stringify(decision), stderr: "", exitCode: 0, timedOut: false });
    expect(await createCodexPlanner()(state)).toEqual(decision);
  });

  it.each(["I think you should inspect...", "```json\n{}\n```", ""])(
    "rejects malformed JSON without attempting recovery: %j", async (stdout) => {
      runCommandMock.mockResolvedValue({ stdout, stderr: "", exitCode: 0, timedOut: false });
      await expect(createCodexPlanner()(state)).rejects.toThrow("Codex planner returned malformed JSON.");
      expect(existsSync(runCommandMock.mock.calls[0][2].cwd)).toBe(false);
    },
  );

  it.each([
    { type: "banana" },
    { type: "complete", task: { ...task, objective: "" } },
    { type: "inspect", request: { paths: [""] } },
  ])("rejects schema-invalid output: %j", async (decision) => {
    runCommandMock.mockResolvedValue({ stdout: JSON.stringify(decision), stderr: "", exitCode: 0, timedOut: false });
    await expect(createCodexPlanner()(state)).rejects.toBeInstanceOf(ZodError);
  });

  it("throws on non-zero process exit", async () => {
    runCommandMock.mockResolvedValue({ stdout: JSON.stringify(inspect), stderr: "Process failed", exitCode: 1, timedOut: false });
    await expect(createCodexPlanner()(state)).rejects.toThrow("Failed to run Codex planner: Process failed");
  });

  it("throws on executable failure and retains its cause", async () => {
    const error = new Error("spawn codex ENOENT");
    runCommandMock.mockResolvedValue({ stdout: "", stderr: "", exitCode: null, timedOut: false, error });
    await expect(createCodexPlanner()(state)).rejects.toMatchObject({ cause: error });
  });

  it("throws on timeout even when stdout contains a valid decision", async () => {
    runCommandMock.mockResolvedValue({ stdout: JSON.stringify(inspect), stderr: "", exitCode: 0, timedOut: true });
    await expect(createCodexPlanner({ timeoutMs: 42 })(state)).rejects.toThrow("Codex planner timed out after 42 ms.");
  });

  it("propagates unexpected runner rejection and cleans up the working directory", async () => {
    const error = new Error("System failure");
    runCommandMock.mockRejectedValue(error);
    await expect(createCodexPlanner()(state)).rejects.toBe(error);
    expect(existsSync(runCommandMock.mock.calls[0][2].cwd)).toBe(false);
  });
});
