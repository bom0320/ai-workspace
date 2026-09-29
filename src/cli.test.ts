import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ZodError } from "zod";

import type { TaskContract } from "./contracts/task.js";
import { loadTaskContract } from "./contracts/task-loader.js";
import type { ExecutionResult } from "./execution/execution-result.js";
import { executeTask } from "./execution/task-executor.js";
import { resolveRepositoryRoot } from "./repository/repository.js";
import { runCli } from "./cli.js";

vi.mock("./contracts/task-loader.js", () => ({ loadTaskContract: vi.fn() }));
vi.mock("./execution/task-executor.js", () => ({ executeTask: vi.fn() }));
vi.mock("./repository/repository.js", () => ({
  resolveRepositoryRoot: vi.fn(),
}));

const task: TaskContract = {
  id: "task-001",
  goalId: "goal-001",
  objective: "Complete the requested change",
  targetRepository: "example-repository",
  allowedPaths: ["src/example.ts"],
  forbiddenPaths: ["docs/architecture.md"],
  constraints: ["Keep the change scoped"],
  acceptanceCriteria: ["The feature works"],
  verification: ["pnpm test"],
};

const successfulResult: ExecutionResult = {
  passed: true,
  evidence: {
    workerOutput: "Codex final output",
    changedPaths: ["src/example.ts"],
    verification: { passed: true, commands: [] },
  },
  scope: { passed: true, violations: [] },
  failures: [],
  artifacts: {
    directory: "/workspace/.ai-workspace/runs/run-001",
    baseCommit: "base-commit-sha",
  },
};

const loadTaskContractMock = vi.mocked(loadTaskContract);
const resolveRepositoryRootMock = vi.mocked(resolveRepositoryRoot);
const executeTaskMock = vi.mocked(executeTask);

beforeEach(() => {
  vi.clearAllMocks();
  vi.spyOn(console, "log").mockImplementation(() => {});
  vi.spyOn(console, "error").mockImplementation(() => {});
  loadTaskContractMock.mockReturnValue(task);
  resolveRepositoryRootMock.mockReturnValue("/repositories/example");
  executeTaskMock.mockReturnValue(successfulResult);
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("CLI", () => {
  it("rejects a missing Task file argument", () => {
    expect(runCli([])).toBe(1);
    expect(console.error).toHaveBeenCalledWith(
      "Error: Task file path is required.",
    );
  });

  it("rejects a missing Repository path argument", () => {
    expect(runCli(["task.json"])).toBe(1);
    expect(console.error).toHaveBeenCalledWith(
      "Error: Repository path is required.",
    );
  });

  it("keeps TaskContract validation as a preflight failure", () => {
    loadTaskContractMock.mockImplementation(() => {
      throw new ZodError([]);
    });

    expect(runCli(["task.json", "/repositories/example"])).toBe(1);
    expect(console.error).toHaveBeenCalledWith(
      "Error: TaskContract validation failed.",
    );
    expect(resolveRepositoryRootMock).not.toHaveBeenCalled();
    expect(executeTaskMock).not.toHaveBeenCalled();
  });

  it("keeps Repository resolution as a preflight failure", () => {
    resolveRepositoryRootMock.mockImplementation(() => {
      throw new Error("not a Git repository");
    });

    expect(runCli(["task.json", "/repositories/example"])).toBe(1);
    expect(console.error).toHaveBeenCalledWith(
      "Error: Repository resolution failed: not a Git repository",
    );
    expect(executeTaskMock).not.toHaveBeenCalled();
  });

  it("passes the validated Task and Repository root to executeTask", () => {
    expect(runCli(["task.json", "/repositories/example"])).toBe(0);
    expect(executeTaskMock).toHaveBeenCalledWith(
      task,
      "/repositories/example",
    );
  });

  it("returns success and reports an ExecutionResult that passed", () => {
    expect(runCli(["task.json", "/repositories/example"])).toBe(0);
    expect(console.log).toHaveBeenCalledWith("Codex Worker: complete");
    expect(console.log).toHaveBeenCalledWith("Verification: passed");
    expect(console.log).toHaveBeenCalledWith("Changed Paths: 1");
    expect(console.log).toHaveBeenCalledWith(
      "Run Artifacts: /workspace/.ai-workspace/runs/run-001",
    );
  });

  it("returns failure and reports preserved result details", () => {
    executeTaskMock.mockReturnValue({
      passed: false,
      evidence: {
        workerOutput: "Codex final output",
        changedPaths: ["README.md"],
      },
      scope: { passed: false, violations: ["README.md"] },
      failures: [
        { stage: "scope", message: "Scope violations: README.md" },
        { stage: "cleanup", message: "worktree removal failed" },
      ],
    });

    expect(runCli(["task.json", "/repositories/example"])).toBe(1);
    expect(console.error).toHaveBeenCalledWith("Scope: failed");
    expect(console.error).toHaveBeenCalledWith(
      "Scope violation: README.md",
    );
    expect(console.error).toHaveBeenCalledWith(
      "Error: Execution Workspace cleanup failed: worktree removal failed",
    );
  });

  it("reports failed Verification commands from ExecutionResult", () => {
    executeTaskMock.mockReturnValue({
      passed: false,
      evidence: {
        workerOutput: "Codex final output",
        changedPaths: ["src/example.ts"],
        verification: {
          passed: false,
          commands: [
            {
              command: "pnpm test",
              passed: false,
              exitCode: 1,
              stdout: "",
              stderr: "tests failed",
            },
          ],
        },
      },
      scope: { passed: true, violations: [] },
      failures: [{ stage: "verification", message: "Verification failed." }],
    });

    expect(runCli(["task.json", "/repositories/example"])).toBe(1);
    expect(console.error).toHaveBeenCalledWith("Verification: failed");
    expect(console.error).toHaveBeenCalledWith(
      "Failed command: pnpm test (exit code: 1)",
    );
    expect(console.error).not.toHaveBeenCalledWith(
      "Error: Verification failed: Verification failed.",
    );
  });

  it("reports a Verification failure when no Verification Evidence exists", () => {
    executeTaskMock.mockReturnValue({
      passed: false,
      evidence: {
        workerOutput: "Codex final output",
        changedPaths: ["src/example.ts"],
      },
      scope: { passed: true, violations: [] },
      failures: [
        { stage: "verification", message: "verification runner failed" },
      ],
    });

    expect(runCli(["task.json", "/repositories/example"])).toBe(1);
    expect(console.error).toHaveBeenCalledWith(
      "Error: Verification failed: verification runner failed",
    );
  });

  it("reports preservation failure and the retained Workspace", () => {
    executeTaskMock.mockReturnValue({
      passed: false,
      evidence: { workerOutput: "Codex final output" },
      failures: [
        { stage: "preservation", message: "patch storage failed" },
      ],
      artifacts: { directory: "/workspace/.ai-workspace/runs/run-002" },
      retainedWorkspace: "/tmp/execution-workspace",
    });

    expect(runCli(["task.json", "/repositories/example"])).toBe(1);
    expect(console.log).toHaveBeenCalledWith(
      "Run Artifacts: /workspace/.ai-workspace/runs/run-002",
    );
    expect(console.error).toHaveBeenCalledWith(
      "Execution Workspace retained: /tmp/execution-workspace",
    );
    expect(console.error).toHaveBeenCalledWith(
      "Error: Execution result preservation failed: patch storage failed",
    );
  });

  it("reports final result storage failure", () => {
    executeTaskMock.mockReturnValue({
      passed: false,
      evidence: {},
      failures: [{ stage: "report", message: "result storage failed" }],
      artifacts: { directory: "/workspace/.ai-workspace/runs/run-003" },
    });

    expect(runCli(["task.json", "/repositories/example"])).toBe(1);
    expect(console.error).toHaveBeenCalledWith(
      "Error: Final execution report failed: result storage failed",
    );
  });
});
