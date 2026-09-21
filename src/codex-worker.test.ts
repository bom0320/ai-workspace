import { execFileSync } from "node:child_process";

import { beforeEach, describe, expect, it, vi } from "vitest";

import type { TaskContract } from "./contracts/task.js";
import { runCodexWorker } from "./codex-worker.js";

vi.mock("node:child_process", () => ({
  execFileSync: vi.fn(),
}));

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

const execFileSyncMock = vi.mocked(execFileSync);

beforeEach(() => {
  execFileSyncMock.mockReset();
});

describe("runCodexWorker", () => {
  it("runs Codex in the workspace with TaskContract instructions", () => {
    execFileSyncMock.mockReturnValue("Codex final output");

    const output = runCodexWorker(task, "/tmp/execution-workspace");

    expect(output).toBe("Codex final output");
    expect(execFileSyncMock).toHaveBeenCalledOnce();

    const [command, args, options] = execFileSyncMock.mock.calls[0];
    const prompt = args?.[3];

    expect(command).toBe("codex");
    expect(args?.slice(0, 3)).toEqual([
      "exec",
      "--sandbox",
      "workspace-write",
    ]);
    expect(options).toMatchObject({
      cwd: "/tmp/execution-workspace",
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
    });
    expect(prompt).toContain(task.objective);
    expect(prompt).toContain(task.allowedPaths[0]);
    expect(prompt).toContain(task.forbiddenPaths[0]);
    expect(prompt).toContain(task.constraints[0]);
    expect(prompt).toContain(task.acceptanceCriteria[0]);
    expect(prompt).toContain(task.verification[0]);
  });

  it("preserves the Codex failure and stderr in a Worker error", () => {
    const originalError = Object.assign(new Error("Command failed"), {
      stderr: "Codex authentication failed",
    });

    execFileSyncMock.mockImplementation(() => {
      throw originalError;
    });

    try {
      runCodexWorker(task, "/tmp/execution-workspace");
      throw new Error("Expected runCodexWorker to fail");
    } catch (error) {
      expect(error).toBeInstanceOf(Error);
      expect((error as Error).message).toBe(
        "Failed to run Codex worker: Codex authentication failed",
      );
      expect((error as Error).cause).toBe(originalError);
    }
  });
});
