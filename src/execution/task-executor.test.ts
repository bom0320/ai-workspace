import { beforeEach, describe, expect, it, vi } from "vitest";

import { runCodexWorker } from "../workers/codex-worker.js";
import type { TaskContract } from "../contracts/task.js";
import { collectChangedPaths } from "./execution-evidence.js";
import {
  createExecutionWorkspace,
  removeExecutionWorkspace,
} from "../repository/execution-workspace.js";
import { checkScope } from "../verification/scope-enforcement.js";
import { executeTask } from "./task-executor.js";
import { runVerification } from "../verification/verification-runner.js";

vi.mock("../workers/codex-worker.js", () => ({ runCodexWorker: vi.fn() }));
vi.mock("./execution-evidence.js", () => ({ collectChangedPaths: vi.fn() }));
vi.mock("../repository/execution-workspace.js", () => ({
  createExecutionWorkspace: vi.fn(),
  removeExecutionWorkspace: vi.fn(),
}));
vi.mock("../verification/scope-enforcement.js", () => ({
  checkScope: vi.fn(),
}));
vi.mock("../verification/verification-runner.js", () => ({
  runVerification: vi.fn(),
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

const createExecutionWorkspaceMock = vi.mocked(createExecutionWorkspace);
const removeExecutionWorkspaceMock = vi.mocked(removeExecutionWorkspace);
const runCodexWorkerMock = vi.mocked(runCodexWorker);
const collectChangedPathsMock = vi.mocked(collectChangedPaths);
const checkScopeMock = vi.mocked(checkScope);
const runVerificationMock = vi.mocked(runVerification);

beforeEach(() => {
  vi.clearAllMocks();
  createExecutionWorkspaceMock.mockReturnValue("/tmp/execution-workspace");
  runCodexWorkerMock.mockReturnValue("Codex final output");
  collectChangedPathsMock.mockReturnValue(["src/example.ts"]);
  checkScopeMock.mockReturnValue({ passed: true, violations: [] });
  runVerificationMock.mockReturnValue({ passed: true, commands: [] });
});

describe("executeTask", () => {
  it("returns complete evidence and scope after a successful ordered execution", () => {
    const result = executeTask(task, "/repositories/example");

    expect(result).toEqual({
      passed: true,
      evidence: {
        workerOutput: "Codex final output",
        changedPaths: ["src/example.ts"],
        verification: { passed: true, commands: [] },
      },
      scope: { passed: true, violations: [] },
      failures: [],
    });
    expect(createExecutionWorkspaceMock.mock.invocationCallOrder[0]).toBeLessThan(
      runCodexWorkerMock.mock.invocationCallOrder[0],
    );
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
  });

  it("records Workspace creation failure without attempting cleanup", () => {
    createExecutionWorkspaceMock.mockImplementation(() => {
      throw new Error("worktree creation failed");
    });

    const result = executeTask(task, "/repositories/example");

    expect(result).toEqual({
      passed: false,
      evidence: {},
      failures: [{ stage: "workspace", message: "worktree creation failed" }],
    });
    expect(runCodexWorkerMock).not.toHaveBeenCalled();
    expect(removeExecutionWorkspaceMock).not.toHaveBeenCalled();
  });

  it("records Worker failure, skips later stages, and cleans up", () => {
    runCodexWorkerMock.mockImplementation(() => {
      throw new Error("worker failed");
    });

    const result = executeTask(task, "/repositories/example");

    expect(result.failures).toEqual([
      { stage: "worker", message: "worker failed" },
    ]);
    expect(result.evidence).toEqual({});
    expect(collectChangedPathsMock).not.toHaveBeenCalled();
    expect(checkScopeMock).not.toHaveBeenCalled();
    expect(runVerificationMock).not.toHaveBeenCalled();
    expect(removeExecutionWorkspaceMock).toHaveBeenCalledOnce();
  });

  it("preserves Worker output when Evidence collection fails", () => {
    collectChangedPathsMock.mockImplementation(() => {
      throw new Error("Git status failed");
    });

    const result = executeTask(task, "/repositories/example");

    expect(result.evidence).toEqual({ workerOutput: "Codex final output" });
    expect(result.failures).toEqual([
      { stage: "evidence", message: "Git status failed" },
    ]);
    expect(checkScopeMock).not.toHaveBeenCalled();
    expect(runVerificationMock).not.toHaveBeenCalled();
    expect(removeExecutionWorkspaceMock).toHaveBeenCalledOnce();
  });

  it("preserves Evidence and scope while skipping Verification on a Scope failure", () => {
    checkScopeMock.mockReturnValue({
      passed: false,
      violations: ["README.md"],
    });
    collectChangedPathsMock.mockReturnValue(["README.md"]);

    const result = executeTask(task, "/repositories/example");

    expect(result.evidence).toEqual({
      workerOutput: "Codex final output",
      changedPaths: ["README.md"],
    });
    expect(result.scope).toEqual({
      passed: false,
      violations: ["README.md"],
    });
    expect(result.failures).toEqual([
      { stage: "scope", message: "Scope violations: README.md" },
    ]);
    expect(runVerificationMock).not.toHaveBeenCalled();
    expect(removeExecutionWorkspaceMock).toHaveBeenCalledOnce();
  });

  it("preserves failed Verification as Evidence", () => {
    const verification = {
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
    };
    runVerificationMock.mockReturnValue(verification);

    const result = executeTask(task, "/repositories/example");

    expect(result.passed).toBe(false);
    expect(result.evidence.verification).toBe(verification);
    expect(result.scope).toEqual({ passed: true, violations: [] });
    expect(result.failures).toEqual([
      { stage: "verification", message: "Verification failed." },
    ]);
    expect(removeExecutionWorkspaceMock).toHaveBeenCalledOnce();
  });

  it("preserves prior Evidence and scope when Verification throws", () => {
    runVerificationMock.mockImplementation(() => {
      throw new Error("verification runner failed");
    });

    const result = executeTask(task, "/repositories/example");

    expect(result.passed).toBe(false);
    expect(result.evidence).toEqual({
      workerOutput: "Codex final output",
      changedPaths: ["src/example.ts"],
    });
    expect(result.scope).toEqual({ passed: true, violations: [] });
    expect(result.failures).toEqual([
      { stage: "verification", message: "verification runner failed" },
    ]);
    expect(removeExecutionWorkspaceMock).toHaveBeenCalledOnce();
  });

  it("preserves Verification and both failures when Verification and cleanup fail", () => {
    const verification = {
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
    };
    runVerificationMock.mockReturnValue(verification);
    removeExecutionWorkspaceMock.mockImplementation(() => {
      throw new Error("cleanup failed");
    });

    const result = executeTask(task, "/repositories/example");

    expect(result.passed).toBe(false);
    expect(result.evidence.verification).toBe(verification);
    expect(result.failures).toEqual([
      { stage: "verification", message: "Verification failed." },
      { stage: "cleanup", message: "cleanup failed" },
    ]);
  });

  it("turns cleanup failure into a failed result while preserving Evidence", () => {
    removeExecutionWorkspaceMock.mockImplementation(() => {
      throw new Error("worktree removal failed");
    });

    const result = executeTask(task, "/repositories/example");

    expect(result.passed).toBe(false);
    expect(result.evidence.workerOutput).toBe("Codex final output");
    expect(result.evidence.changedPaths).toEqual(["src/example.ts"]);
    expect(result.evidence.verification?.passed).toBe(true);
    expect(result.failures).toEqual([
      { stage: "cleanup", message: "worktree removal failed" },
    ]);
  });

  it("preserves both Worker and cleanup failures", () => {
    runCodexWorkerMock.mockImplementation(() => {
      throw new Error("worker failed");
    });
    removeExecutionWorkspaceMock.mockImplementation(() => {
      throw new Error("cleanup failed");
    });

    const result = executeTask(task, "/repositories/example");

    expect(result.passed).toBe(false);
    expect(result.failures).toEqual([
      { stage: "worker", message: "worker failed" },
      { stage: "cleanup", message: "cleanup failed" },
    ]);
    expect(removeExecutionWorkspaceMock).toHaveBeenCalledOnce();
  });
});
