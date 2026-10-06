import { beforeEach, describe, expect, it, vi } from "vitest";

import type { TaskContract } from "../../contracts/task.js";
import { runCommand } from "../../infrastructure/process/command-runner.js";
import { runCodexWorker } from "./codex-worker.js";

vi.mock("../../infrastructure/process/command-runner.js", () => ({ runCommand: vi.fn() }));

const task: TaskContract = {
  id: "task-001",
  goalId: "goal-001",
  objective: "Implement the requested change",
  targetRepository: "example-repository",
  allowedPaths: ["src/allowed.ts"],
  forbiddenPaths: ["src/forbidden.ts"],
  constraints: ["Do not add dependencies"],
  acceptanceCriteria: ["The change behaves as requested"],
  verification: ["pnpm test"],
};

const runCommandMock = vi.mocked(runCommand);

beforeEach(() => {
  runCommandMock.mockReset();
});

describe("runCodexWorker", () => {
  it("runs Codex in the workspace with TaskContract instructions", async () => {
    runCommandMock.mockResolvedValue({
      stdout: "Codex final output",
      stderr: "",
      exitCode: 0,
      timedOut: false,
    });

    const output = await runCodexWorker(
      task,
      "/tmp/execution-workspace",
      1_000,
    );

    expect(output).toBe("Codex final output");
    expect(runCommandMock).toHaveBeenCalledOnce();

    const [command, args, options] = runCommandMock.mock.calls[0];
    const prompt = args[3];

    expect(command).toBe("codex");
    expect(args.slice(0, 3)).toEqual([
      "exec",
      "--sandbox",
      "workspace-write",
    ]);
    expect(options).toEqual({
      cwd: "/tmp/execution-workspace",
      timeoutMs: 1_000,
    });
    expect(prompt).toContain(task.objective);
    expect(prompt).toContain(task.allowedPaths[0]);
    expect(prompt).toContain(task.forbiddenPaths[0]);
    expect(prompt).toContain(task.constraints[0]);
    expect(prompt).toContain(task.acceptanceCriteria[0]);
    expect(prompt).toContain(task.verification[0]);
  });

  it("preserves Codex stderr in a Worker error", async () => {
    runCommandMock.mockResolvedValue({
      stdout: "",
      stderr: "Codex authentication failed",
      exitCode: 1,
      timedOut: false,
    });

    await expect(
      runCodexWorker(task, "/tmp/execution-workspace"),
    ).rejects.toThrow(
      "Failed to run Codex worker: Codex authentication failed",
    );
  });

  it("reports Worker timeout distinctly", async () => {
    runCommandMock.mockResolvedValue({
      stdout: "partial output",
      stderr: "",
      exitCode: null,
      timedOut: true,
    });

    await expect(
      runCodexWorker(task, "/tmp/execution-workspace", 25),
    ).rejects.toThrow(
      "Failed to run Codex worker: Codex worker timed out after 25 ms.",
    );
  });
});
