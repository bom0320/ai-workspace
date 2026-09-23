import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { runCodexWorker } from "./codex-worker.js";
import type { TaskContract } from "./contracts/task.js";
import { collectChangedPaths } from "./execution-evidence.js";
import {
  createExecutionWorkspace,
  removeExecutionWorkspace,
} from "./execution-workspace.js";
import { resolveRepositoryRoot } from "./repository.js";
import { checkScope } from "./scope-enforcement.js";
import { loadTaskContract } from "./task-loader.js";
import { runVerification } from "./verification-runner.js";
import { runCli } from "./cli.js";

vi.mock("./codex-worker.js", () => ({ runCodexWorker: vi.fn() }));
vi.mock("./execution-evidence.js", () => ({ collectChangedPaths: vi.fn() }));
vi.mock("./execution-workspace.js", () => ({
  createExecutionWorkspace: vi.fn(),
  removeExecutionWorkspace: vi.fn(),
}));
vi.mock("./repository.js", () => ({ resolveRepositoryRoot: vi.fn() }));
vi.mock("./scope-enforcement.js", () => ({ checkScope: vi.fn() }));
vi.mock("./task-loader.js", () => ({ loadTaskContract: vi.fn() }));
vi.mock("./verification-runner.js", () => ({ runVerification: vi.fn() }));

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

const loadTaskContractMock = vi.mocked(loadTaskContract);
const resolveRepositoryRootMock = vi.mocked(resolveRepositoryRoot);
const createExecutionWorkspaceMock = vi.mocked(createExecutionWorkspace);
const removeExecutionWorkspaceMock = vi.mocked(removeExecutionWorkspace);
const runCodexWorkerMock = vi.mocked(runCodexWorker);
const collectChangedPathsMock = vi.mocked(collectChangedPaths);
const checkScopeMock = vi.mocked(checkScope);
const runVerificationMock = vi.mocked(runVerification);

beforeEach(() => {
  vi.clearAllMocks();
  vi.spyOn(console, "log").mockImplementation(() => {});
  vi.spyOn(console, "error").mockImplementation(() => {});

  loadTaskContractMock.mockReturnValue(task);
  resolveRepositoryRootMock.mockReturnValue("/repositories/example");
  createExecutionWorkspaceMock.mockReturnValue("/tmp/execution-workspace");
  runCodexWorkerMock.mockReturnValue("Codex final output");
  collectChangedPathsMock.mockReturnValue(["src/example.ts"]);
  checkScopeMock.mockReturnValue({ passed: true, violations: [] });
  runVerificationMock.mockReturnValue({ passed: true, commands: [] });
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

  it("fails when Execution Workspace creation fails", () => {
    createExecutionWorkspaceMock.mockImplementation(() => {
      throw new Error("worktree creation failed");
    });

    expect(runCli(["task.json", "/repositories/example"])).toBe(1);
    expect(console.error).toHaveBeenCalledWith(
      "Error: Execution Workspace creation failed: worktree creation failed",
    );
    expect(runCodexWorkerMock).not.toHaveBeenCalled();
    expect(collectChangedPathsMock).not.toHaveBeenCalled();
    expect(checkScopeMock).not.toHaveBeenCalled();
    expect(runVerificationMock).not.toHaveBeenCalled();
    expect(removeExecutionWorkspaceMock).not.toHaveBeenCalled();
  });

  it("fails when the Codex Worker fails", () => {
    runCodexWorkerMock.mockImplementation(() => {
      throw new Error("Failed to run Codex worker: Codex failed");
    });

    expect(runCli(["task.json", "/repositories/example"])).toBe(1);
    expect(console.error).toHaveBeenCalledWith(
      "Error: Codex Worker failed: Failed to run Codex worker: Codex failed",
    );
    expect(collectChangedPathsMock).not.toHaveBeenCalled();
    expect(checkScopeMock).not.toHaveBeenCalled();
    expect(runVerificationMock).not.toHaveBeenCalled();
    expect(removeExecutionWorkspaceMock).toHaveBeenCalledOnce();
    expect(removeExecutionWorkspaceMock).toHaveBeenCalledWith(
      "/repositories/example",
      "/tmp/execution-workspace",
    );
  });

  it("fails when Verification fails and reports failed commands", () => {
    runVerificationMock.mockReturnValue({
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
    });

    expect(runCli(["task.json", "/repositories/example"])).toBe(1);
    expect(console.error).toHaveBeenCalledWith("Verification: failed");
    expect(console.error).toHaveBeenCalledWith(
      "Failed command: pnpm test (exit code: 1)",
    );
    expect(removeExecutionWorkspaceMock).toHaveBeenCalledOnce();
  });

  it("fails when Execution Evidence collection fails", () => {
    collectChangedPathsMock.mockImplementation(() => {
      throw new Error("Failed to collect execution evidence: Git failed");
    });

    expect(runCli(["task.json", "/repositories/example"])).toBe(1);
    expect(console.error).toHaveBeenCalledWith(
      "Error: Execution Evidence collection failed: Failed to collect execution evidence: Git failed",
    );
    expect(checkScopeMock).not.toHaveBeenCalled();
    expect(runVerificationMock).not.toHaveBeenCalled();
    expect(removeExecutionWorkspaceMock).toHaveBeenCalledOnce();
  });

  it("fails on Scope violations without running Verification", () => {
    checkScopeMock.mockReturnValue({
      passed: false,
      violations: ["README.md", "docs/architecture.md"],
    });

    expect(runCli(["task.json", "/repositories/example"])).toBe(1);
    expect(checkScopeMock).toHaveBeenCalledWith(
      ["src/example.ts"],
      task.allowedPaths,
      task.forbiddenPaths,
    );
    expect(console.error).toHaveBeenCalledWith("Scope: failed");
    expect(console.error).toHaveBeenCalledWith("Scope violation: README.md");
    expect(console.error).toHaveBeenCalledWith(
      "Scope violation: docs/architecture.md",
    );
    expect(runVerificationMock).not.toHaveBeenCalled();
    expect(removeExecutionWorkspaceMock).toHaveBeenCalledOnce();
  });

  it("fails when Execution Workspace cleanup fails", () => {
    removeExecutionWorkspaceMock.mockImplementation(() => {
      throw new Error("worktree removal failed");
    });

    expect(runCli(["task.json", "/repositories/example"])).toBe(1);
    expect(console.error).toHaveBeenCalledWith(
      "Error: Execution Workspace cleanup failed: worktree removal failed",
    );
  });

  it("preserves failure when both the Worker and cleanup fail", () => {
    runCodexWorkerMock.mockImplementation(() => {
      throw new Error("Worker failed");
    });
    removeExecutionWorkspaceMock.mockImplementation(() => {
      throw new Error("cleanup failed");
    });

    expect(runCli(["task.json", "/repositories/example"])).toBe(1);
    expect(console.error).toHaveBeenCalledWith(
      "Error: Codex Worker failed: Worker failed",
    );
    expect(console.error).toHaveBeenCalledWith(
      "Error: Execution Workspace cleanup failed: cleanup failed",
    );
    expect(runVerificationMock).not.toHaveBeenCalled();
  });

  it("returns success after the complete Worker flow passes", () => {
    expect(runCli(["task.json", "/repositories/example"])).toBe(0);

    expect(loadTaskContractMock).toHaveBeenCalledWith("task.json");
    expect(resolveRepositoryRootMock).toHaveBeenCalledWith(
      "/repositories/example",
    );
    expect(createExecutionWorkspaceMock).toHaveBeenCalledWith(
      "/repositories/example",
    );
    expect(runCodexWorkerMock).toHaveBeenCalledWith(
      task,
      "/tmp/execution-workspace",
    );
    expect(collectChangedPathsMock).toHaveBeenCalledWith(
      "/tmp/execution-workspace",
    );
    expect(checkScopeMock).toHaveBeenCalledWith(
      ["src/example.ts"],
      task.allowedPaths,
      task.forbiddenPaths,
    );
    expect(runVerificationMock).toHaveBeenCalledWith(
      task.verification,
      "/tmp/execution-workspace",
    );
    expect(removeExecutionWorkspaceMock).toHaveBeenCalledOnce();
    expect(removeExecutionWorkspaceMock).toHaveBeenCalledWith(
      "/repositories/example",
      "/tmp/execution-workspace",
    );
    expect(loadTaskContractMock.mock.invocationCallOrder[0]).toBeLessThan(
      resolveRepositoryRootMock.mock.invocationCallOrder[0],
    );
    expect(resolveRepositoryRootMock.mock.invocationCallOrder[0]).toBeLessThan(
      createExecutionWorkspaceMock.mock.invocationCallOrder[0],
    );
    expect(
      createExecutionWorkspaceMock.mock.invocationCallOrder[0],
    ).toBeLessThan(runCodexWorkerMock.mock.invocationCallOrder[0]);
    expect(runCodexWorkerMock.mock.invocationCallOrder[0]).toBeLessThan(
      collectChangedPathsMock.mock.invocationCallOrder[0],
    );
    expect(collectChangedPathsMock.mock.invocationCallOrder[0]).toBeLessThan(
      checkScopeMock.mock.invocationCallOrder[0],
    );
    expect(checkScopeMock.mock.invocationCallOrder[0]).toBeLessThan(
      runVerificationMock.mock.invocationCallOrder[0],
    );
    expect(runVerificationMock.mock.invocationCallOrder[0]).toBeLessThan(
      removeExecutionWorkspaceMock.mock.invocationCallOrder[0],
    );
    expect(console.log).toHaveBeenCalledWith("Verification: passed");
  });
});
