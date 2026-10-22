import { beforeEach, describe, expect, it, vi } from "vitest";

import type { TaskContract } from "@/contracts/task.js";
import { runCommand } from "@/infrastructure/process/index.js";

import { runCodexWorker } from "./codex-worker.js";
import type { ExecutionTelemetry } from "../model/result.js";

vi.mock("@/infrastructure/process/index.js", () => ({ runCommand: vi.fn() }));

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
  it("uses supplied context as reference while preserving verification ownership", async () => {
    runCommandMock.mockResolvedValue({
      stdout: "done",
      stderr: "",
      exitCode: 0,
      timedOut: false,
    });
    const files = [{ path: "README.md", content: "Known project description" }];
    await runCodexWorker(task, "/tmp/workspace", 1000, undefined, {
      inspectedFiles: files,
    });
    const prompt = runCommandMock.mock.calls[0][1][3];
    expect(prompt).toContain(JSON.stringify(files));
    for (const rule of [
      "Use the supplied planning context before re-reading",
      "Do not re-read files already included",
      "current workspace state must be confirmed",
      "not explicitly listed",
      "workspace remains the source of truth",
      "The Harness will execute",
      "Do not run the listed verification commands yourself",
    ])
      expect(prompt).toContain(rule);
  });

  it("omits oversized context", async () => {
    runCommandMock.mockResolvedValue({
      stdout: "done",
      stderr: "",
      exitCode: 0,
      timedOut: false,
    });
    await runCodexWorker(task, "/tmp/workspace", 1000, undefined, {
      inspectedFiles: [
        { path: "large.txt", content: "x".repeat(64 * 1024 + 1) },
      ],
    });
    expect(runCommandMock.mock.calls[0][1][3]).not.toContain(
      "Repository context already inspected"
    );
  });
  it("records setup, actual process timing and output processing without changing stdout", async () => {
    const telemetry: ExecutionTelemetry = { totalDurationMs: 0 };

    runCommandMock.mockResolvedValue({
      stdout: "complete",
      stderr: "",
      exitCode: 0,
      timedOut: false,
      processDurationMs: 12,
    });

    expect(await runCodexWorker(task, "/tmp/workspace", 1000, telemetry)).toBe(
      "complete"
    );

    expect(telemetry.codexProcessDurationMs).toBe(12);
    expect(telemetry.workerSetupDurationMs).toBeGreaterThanOrEqual(0);
    expect(telemetry.workerOutputProcessingDurationMs).toBeGreaterThanOrEqual(
      0
    );
  });

  it("retains process and output timing on process failure", async () => {
    const telemetry: ExecutionTelemetry = { totalDurationMs: 0 };

    runCommandMock.mockResolvedValue({
      stdout: "",
      stderr: "failure",
      exitCode: 1,
      timedOut: false,
      processDurationMs: 5,
    });

    await expect(
      runCodexWorker(task, "/tmp/workspace", 1000, telemetry)
    ).rejects.toThrow("failure");

    expect(telemetry.codexProcessDurationMs).toBe(5);
    expect(telemetry.workerOutputProcessingDurationMs).toBeGreaterThanOrEqual(
      0
    );
  });

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
      1_000
    );

    expect(output).toBe("Codex final output");
    expect(runCommandMock).toHaveBeenCalledOnce();

    const [command, args, options] = runCommandMock.mock.calls[0];
    const prompt = args[3];

    expect(command).toBe("codex");
    expect(args.slice(0, 3)).toEqual(["exec", "--sandbox", "workspace-write"]);

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

    expect(prompt).toContain(
      "The Harness will execute the TaskContract verification commands after you finish."
    );
    expect(prompt).toContain(
      "Do not run the listed verification commands yourself."
    );
    expect(prompt).toContain(
      "Do not run full typecheck, test, build, or diff-check commands unless they are strictly required to diagnose a concrete implementation problem."
    );
    expect(prompt).toContain(
      "Focus on inspecting only the files needed for the task, making the requested changes, and returning a concise summary."
    );
  });

  it("preserves Codex stderr in a Worker error", async () => {
    runCommandMock.mockResolvedValue({
      stdout: "",
      stderr: "Codex authentication failed",
      exitCode: 1,
      timedOut: false,
    });

    await expect(
      runCodexWorker(task, "/tmp/execution-workspace")
    ).rejects.toThrow(
      "Failed to run Codex worker: Codex authentication failed"
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
      runCodexWorker(task, "/tmp/execution-workspace", 25)
    ).rejects.toThrow(
      "Failed to run Codex worker: Codex worker timed out after 25 ms."
    );
  });
});
