import { beforeEach, describe, expect, it, vi } from "vitest";

import type { TaskContract } from "@/contracts/task.js";
import { runCommand } from "@/infrastructure/process/index.js";

import { createCodexWorkerPrompt, runCodexWorker } from "./codex-worker.js";
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
  implementationPlan: {
    background: "Clarify behavior",
    currentState: "The expected change is absent",
    targetDesign: "Preserve the existing contract",
    steps: [
      {
        title: "Apply change",
        targetPaths: ["src/allowed.ts"],
        instructions: ["Implement requested behavior"],
      },
    ],
  },
};

const runCommandMock = vi.mocked(runCommand);

beforeEach(() => {
  runCommandMock.mockReset();
});

describe("runCodexWorker", () => {
  it.each([undefined, ["Update the allowed file"]])(
    "rejects tasks without a structured plan before running Codex",
    async (implementationSteps) => {
      const legacy = {
        ...task,
        implementationPlan: undefined,
        implementationSteps,
      };
      await expect(
        runCodexWorker(legacy, "/tmp/workspace", 1000)
      ).rejects.toThrow(
        "Task execution requires a structured implementation plan."
      );
      expect(runCommandMock).not.toHaveBeenCalled();
    }
  );

  it("renders the structured plan and preserves contractual constraints", () => {
    const prompt = createCodexWorkerPrompt({
      ...task,
      implementationPlan: {
        background: "Avoid duplicate requests",
        currentState: "getUser checks the completed cache",
        targetDesign: "Track requests in flight",
        steps: [
          {
            title: "Change getUser",
            targetPaths: ["src/allowed.ts"],
            instructions: [
              "Reuse an existing promise",
              "Remove rejected requests",
            ],
          },
          {
            title: "Review behavior",
            targetPaths: [],
            instructions: ["Check independent IDs"],
          },
        ],
      },
    });
    expect(prompt).toContain(
      "Background:\nAvoid duplicate requests\n\nCurrent State:\ngetUser checks the completed cache\n\nTarget Design:\nTrack requests in flight"
    );
    expect(prompt).toContain(
      "Step 1. Change getUser\nTarget Paths:\n- src/allowed.ts\nInstructions:\n- Reuse an existing promise\n- Remove rejected requests\nStep 2. Review behavior"
    );
    expect(prompt).toContain("Constraints:\n- Do not add dependencies");
    expect(prompt).toContain(
      "Acceptance criteria:\n- The change behaves as requested"
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
    const prompt = args.at(-1);

    expect(command).toBe("codex");
    expect(args.slice(0, 3)).toEqual(["exec", "--sandbox", "workspace-write"]);

    expect(args).toContain('approval_policy="never"');
    expect(args).toContain("--ignore-user-config");
    expect(args.join(" ")).toContain("network_access=false");

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
      runCodexWorker(task, "/tmp/execution-workspace", 1_000)
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
