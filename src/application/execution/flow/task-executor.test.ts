import { beforeEach, describe, expect, it, vi } from "vitest";

import { runCodexWorker } from "../../../services/worker/index.js";
import type { TaskContract } from "../../../contracts/task.js";
import {
  createExecutionRun,
  getExecutionBaseCommit,
  preserveExecutionChanges,
  writeExecutionResult,
} from "../../../services/artifacts/index.js";
import { collectChangedPaths } from "../../../services/evidence/index.js";
import {
  createExecutionWorkspace,
  removeExecutionWorkspace,
} from "../../../infrastructure/git/index.js";
import { checkScope } from "../../../services/verification/index.js";
import { executeTask } from "./task-executor.js";
import { runVerification } from "../../../services/verification/index.js";

vi.mock("../../../services/worker/index.js", () => ({ runCodexWorker: vi.fn() }));
vi.mock("../../../services/artifacts/index.js", () => ({
  createExecutionRun: vi.fn(),
  getExecutionBaseCommit: vi.fn(),
  preserveExecutionChanges: vi.fn(),
  writeExecutionResult: vi.fn(),
}));
vi.mock("../../../services/evidence/index.js", () => ({ collectChangedPaths: vi.fn() }));
vi.mock("../../../infrastructure/git/index.js", () => ({
  createExecutionWorkspace: vi.fn(),
  removeExecutionWorkspace: vi.fn(),
}));
vi.mock("../../../services/verification/index.js", () => ({
  checkScope: vi.fn(),
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
const createExecutionRunMock = vi.mocked(createExecutionRun);
const getExecutionBaseCommitMock = vi.mocked(getExecutionBaseCommit);
const preserveExecutionChangesMock = vi.mocked(preserveExecutionChanges);
const writeExecutionResultMock = vi.mocked(writeExecutionResult);
const runCodexWorkerMock = vi.mocked(runCodexWorker);
const collectChangedPathsMock = vi.mocked(collectChangedPaths);
const checkScopeMock = vi.mocked(checkScope);
const runVerificationMock = vi.mocked(runVerification);

beforeEach(() => {
  vi.resetAllMocks();
  createExecutionRunMock.mockReturnValue("/runs/run-001");
  createExecutionWorkspaceMock.mockReturnValue("/tmp/execution-workspace");
  getExecutionBaseCommitMock.mockReturnValue("base-commit-sha");
  runCodexWorkerMock.mockResolvedValue("Codex final output");
  collectChangedPathsMock.mockReturnValue(["src/example.ts"]);
  checkScopeMock.mockReturnValue({ passed: true, violations: [] });
  runVerificationMock.mockResolvedValue({ passed: true, commands: [] });
});

describe("executeTask", async () => {
  it("returns complete evidence and scope after a successful ordered execution", async () => {
    const result = await executeTask(task, "/repositories/example");

    expect(result).toEqual({
      passed: true,
      evidence: {
        workerOutput: "Codex final output",
        changedPaths: ["src/example.ts"],
        verification: { passed: true, commands: [] },
      },
      scope: { passed: true, violations: [] },
      failures: [],
      artifacts: {
        directory: "/runs/run-001",
        baseCommit: "base-commit-sha",
      },
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
      collectChangedPathsMock.mock.invocationCallOrder[1],
    );
    expect(collectChangedPathsMock.mock.invocationCallOrder[1]).toBeLessThan(
      preserveExecutionChangesMock.mock.invocationCallOrder[0],
    );
    expect(preserveExecutionChangesMock.mock.invocationCallOrder[0]).toBeLessThan(
      removeExecutionWorkspaceMock.mock.invocationCallOrder[0],
    );
    expect(removeExecutionWorkspaceMock.mock.invocationCallOrder[0]).toBeLessThan(
      writeExecutionResultMock.mock.invocationCallOrder[0],
    );
    expect(collectChangedPathsMock).toHaveBeenNthCalledWith(
      1,
      "/tmp/execution-workspace",
      "base-commit-sha",
    );
    expect(collectChangedPathsMock).toHaveBeenNthCalledWith(
      2,
      "/tmp/execution-workspace",
      "base-commit-sha",
    );
  });

  it("records Workspace creation failure without attempting cleanup", async () => {
    createExecutionWorkspaceMock.mockImplementation(() => {
      throw new Error("worktree creation failed");
    });

    const result = await executeTask(task, "/repositories/example");

    expect(result).toEqual({
      passed: false,
      evidence: {},
      failures: [{ stage: "workspace", message: "worktree creation failed" }],
      artifacts: { directory: "/runs/run-001" },
    });
    expect(runCodexWorkerMock).not.toHaveBeenCalled();
    expect(removeExecutionWorkspaceMock).not.toHaveBeenCalled();
    expect(writeExecutionResultMock).toHaveBeenCalledOnce();
  });

  it("records Worker failure, skips later stages, and cleans up", async () => {
    runCodexWorkerMock.mockImplementation(() => {
      throw new Error("worker failed");
    });

    const result = await executeTask(task, "/repositories/example");

    expect(result.failures).toEqual([
      { stage: "worker", message: "worker failed" },
    ]);
    expect(result.evidence).toEqual({ changedPaths: ["src/example.ts"] });
    expect(collectChangedPathsMock).toHaveBeenCalledWith(
      "/tmp/execution-workspace",
      "base-commit-sha",
    );
    expect(checkScopeMock).not.toHaveBeenCalled();
    expect(runVerificationMock).not.toHaveBeenCalled();
    expect(removeExecutionWorkspaceMock).toHaveBeenCalledOnce();
  });

  it("keeps Worker timeout and records paths changed before timeout", async () => {
    runCodexWorkerMock.mockRejectedValue(
      new Error(
        "Failed to run Codex worker: Codex worker timed out after 25 ms.",
      ),
    );
    collectChangedPathsMock.mockReturnValue(["partial-change.txt"]);

    const result = await executeTask(task, "/repositories/example", {
      workerTimeoutMs: 25,
    });

    expect(runCodexWorkerMock).toHaveBeenCalledWith(
      task,
      "/tmp/execution-workspace",
      25,
    );
    expect(result.evidence.changedPaths).toEqual(["partial-change.txt"]);
    expect(result.failures).toEqual([
      {
        stage: "worker",
        message:
          "Failed to run Codex worker: Codex worker timed out after 25 ms.",
      },
    ]);
    expect(runVerificationMock).not.toHaveBeenCalled();
  });

  it("keeps Worker failure when collecting its partial changes also fails", async () => {
    runCodexWorkerMock.mockRejectedValue(new Error("worker failed"));
    collectChangedPathsMock.mockImplementation(() => {
      throw new Error("evidence failed");
    });

    const result = await executeTask(task, "/repositories/example");

    expect(result.failures).toEqual([
      { stage: "worker", message: "worker failed" },
      { stage: "evidence", message: "evidence failed" },
    ]);
    expect(runVerificationMock).not.toHaveBeenCalled();
  });

  it("preserves Worker output when Evidence collection fails", async () => {
    collectChangedPathsMock.mockImplementation(() => {
      throw new Error("Git status failed");
    });

    const result = await executeTask(task, "/repositories/example");

    expect(result.evidence).toEqual({ workerOutput: "Codex final output" });
    expect(result.failures).toEqual([
      { stage: "evidence", message: "Git status failed" },
    ]);
    expect(checkScopeMock).not.toHaveBeenCalled();
    expect(runVerificationMock).not.toHaveBeenCalled();
    expect(removeExecutionWorkspaceMock).toHaveBeenCalledOnce();
  });

  it("preserves Evidence and scope while skipping Verification on a Scope failure", async () => {
    checkScopeMock.mockReturnValue({
      passed: false,
      violations: ["README.md"],
    });
    collectChangedPathsMock.mockReturnValue(["README.md"]);

    const result = await executeTask(task, "/repositories/example");

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

  it("preserves failed Verification as Evidence", async () => {
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
    runVerificationMock.mockResolvedValue(verification);

    const result = await executeTask(task, "/repositories/example");

    expect(result.passed).toBe(false);
    expect(result.evidence.verification).toBe(verification);
    expect(result.scope).toEqual({ passed: true, violations: [] });
    expect(result.failures).toEqual([
      { stage: "verification", message: "Verification failed." },
    ]);
    expect(removeExecutionWorkspaceMock).toHaveBeenCalledOnce();
  });

  it("preserves prior Evidence and scope when Verification throws", async () => {
    runVerificationMock.mockImplementation(() => {
      throw new Error("verification runner failed");
    });

    const result = await executeTask(task, "/repositories/example");

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

  it("preserves Verification and both failures when Verification and cleanup fail", async () => {
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
    runVerificationMock.mockResolvedValue(verification);
    removeExecutionWorkspaceMock.mockImplementation(() => {
      throw new Error("cleanup failed");
    });

    const result = await executeTask(task, "/repositories/example");

    expect(result.passed).toBe(false);
    expect(result.evidence.verification).toBe(verification);
    expect(result.failures).toEqual([
      { stage: "verification", message: "Verification failed." },
      { stage: "cleanup", message: "cleanup failed" },
    ]);
    expect(result.retainedWorkspace).toBe("/tmp/execution-workspace");
  });

  it("turns cleanup failure into a failed result while preserving Evidence", async () => {
    removeExecutionWorkspaceMock.mockImplementation(() => {
      throw new Error("worktree removal failed");
    });

    const result = await executeTask(task, "/repositories/example");

    expect(result.passed).toBe(false);
    expect(result.evidence.workerOutput).toBe("Codex final output");
    expect(result.evidence.changedPaths).toEqual(["src/example.ts"]);
    expect(result.evidence.verification?.passed).toBe(true);
    expect(result.failures).toEqual([
      { stage: "cleanup", message: "worktree removal failed" },
    ]);
    expect(result.retainedWorkspace).toBe("/tmp/execution-workspace");
    expect(writeExecutionResultMock).toHaveBeenCalledWith(
      "/runs/run-001",
      expect.objectContaining({
        passed: false,
        failures: [
          { stage: "cleanup", message: "worktree removal failed" },
        ],
        retainedWorkspace: "/tmp/execution-workspace",
      }),
    );
  });

  it("preserves both Worker and cleanup failures", async () => {
    runCodexWorkerMock.mockImplementation(() => {
      throw new Error("worker failed");
    });
    removeExecutionWorkspaceMock.mockImplementation(() => {
      throw new Error("cleanup failed");
    });

    const result = await executeTask(task, "/repositories/example");

    expect(result.passed).toBe(false);
    expect(result.failures).toEqual([
      { stage: "worker", message: "worker failed" },
      { stage: "cleanup", message: "cleanup failed" },
    ]);
    expect(result.retainedWorkspace).toBe("/tmp/execution-workspace");
    expect(removeExecutionWorkspaceMock).toHaveBeenCalledOnce();
  });

  it("fails final Scope when Verification creates a forbidden file", async () => {
    collectChangedPathsMock
      .mockReturnValueOnce(["src/example.ts"])
      .mockReturnValueOnce(["README.md", "src/example.ts"]);
    checkScopeMock
      .mockReturnValueOnce({ passed: true, violations: [] })
      .mockReturnValueOnce({ passed: false, violations: ["README.md"] });

    const result = await executeTask(task, "/repositories/example");

    expect(result.passed).toBe(false);
    expect(result.evidence.changedPaths).toEqual([
      "README.md",
      "src/example.ts",
    ]);
    expect(result.scope).toEqual({
      passed: false,
      violations: ["README.md"],
    });
    expect(result.failures).toEqual([
      { stage: "scope", message: "Scope violations: README.md" },
    ]);
  });

  it("keeps Verification failure while capturing final changed paths", async () => {
    const taskWithVerificationOutput: TaskContract = {
      ...task,
      allowedPaths: ["src/example.ts", "verification-output.txt"],
    };
    collectChangedPathsMock
      .mockReturnValueOnce(["src/example.ts"])
      .mockReturnValueOnce(["src/example.ts", "verification-output.txt"]);
    runVerificationMock.mockResolvedValue({
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

    const result = await executeTask(
      taskWithVerificationOutput,
      "/repositories/example",
    );

    expect(result.evidence.changedPaths).toEqual([
      "src/example.ts",
      "verification-output.txt",
    ]);
    expect(result.failures).toEqual([
      { stage: "verification", message: "Verification failed." },
    ]);
  });

  it("retains the Workspace and returns failure when change preservation fails", async () => {
    preserveExecutionChangesMock.mockImplementation(() => {
      throw new Error("patch storage failed");
    });

    const result = await executeTask(task, "/repositories/example");

    expect(result.passed).toBe(false);
    expect(result.failures).toEqual([
      { stage: "preservation", message: "patch storage failed" },
    ]);
    expect(result.retainedWorkspace).toBe("/tmp/execution-workspace");
    expect(removeExecutionWorkspaceMock).not.toHaveBeenCalled();
    expect(writeExecutionResultMock).toHaveBeenCalledOnce();
  });

  it("reports final result storage failure without losing earlier failures", async () => {
    runCodexWorkerMock.mockImplementation(() => {
      throw new Error("worker failed");
    });
    writeExecutionResultMock.mockImplementation(() => {
      throw new Error("result storage failed");
    });

    const result = await executeTask(task, "/repositories/example");

    expect(result.passed).toBe(false);
    expect(result.failures).toEqual([
      { stage: "worker", message: "worker failed" },
      { stage: "report", message: "result storage failed" },
    ]);
    expect(removeExecutionWorkspaceMock).toHaveBeenCalledOnce();
  });
});
