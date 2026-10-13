import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { runCodexWorker } from "../worker/codex-worker.js";
import type { TaskContract } from "@/contracts/task.js";
import {
  createExecutionRun,
  getExecutionBaseCommit,
  preserveExecutionChanges,
  writeExecutionResult,
} from "@/services/artifacts/index.js";
import { collectChangedPaths } from "@/services/evidence/index.js";
import {
  createExecutionWorkspace,
  removeExecutionWorkspace,
} from "@/infrastructure/git/index.js";
import { checkScope } from "@/services/scope/index.js";
import { executeTask } from "./execute-task.js";
import { runVerification } from "@/services/verification/index.js";

vi.mock("../worker/codex-worker.js", () => ({ runCodexWorker: vi.fn() }));
vi.mock("@/services/artifacts/index.js", () => ({
  createExecutionRun: vi.fn(),
  getExecutionBaseCommit: vi.fn(),
  preserveExecutionChanges: vi.fn(),
  writeExecutionResult: vi.fn(),
}));
vi.mock("@/services/evidence/index.js", () => ({ collectChangedPaths: vi.fn() }));
vi.mock("@/infrastructure/git/index.js", () => ({
  createExecutionWorkspace: vi.fn(),
  removeExecutionWorkspace: vi.fn(),
}));
vi.mock("@/services/verification/index.js", () => ({
  runVerification: vi.fn(),
}));
vi.mock("@/services/scope/index.js", () => ({
  checkScope: vi.fn(),
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
  it("passes warm-start context separately to Worker", async () => {
    const workerContext = { inspectedFiles: [{ path: "src/example.ts", content: "Existing content" }] };
    await executeTask(task, "/repositories/example", { workerContext });
    expect(runCodexWorkerMock).toHaveBeenCalledWith(task, "/tmp/execution-workspace", undefined, expect.any(Object), workerContext);
    expect(task).not.toHaveProperty("inspectedFiles");
  });
  afterEach(() => { vi.restoreAllMocks(); });

  it("records monotonic stage timing separately from evidence and persists the same telemetry", async () => {
    let clock = 0;
    vi.spyOn(performance, "now").mockImplementation(() => clock);
    createExecutionRunMock.mockImplementation(() => { clock += 1; return "/runs/run-001"; });
    createExecutionWorkspaceMock.mockImplementation(() => { clock += 2; return "/tmp/execution-workspace"; });
    getExecutionBaseCommitMock.mockImplementation(() => { clock += 7; return "base"; });
    runCodexWorkerMock.mockImplementation(async () => { clock += 3; return "complete"; });
    runVerificationMock.mockImplementation(async () => { clock += 4; return { passed: true, commands: [] }; });
    preserveExecutionChangesMock.mockImplementation(() => { clock += 6; });
    removeExecutionWorkspaceMock.mockImplementation(() => { clock += 5; });
    const result = await executeTask(task, "/repositories/example");
    expect(result.telemetry).toEqual({
      workspaceDurationMs: 2, workerDurationMs: 3, verificationDurationMs: 4,
      totalDurationMs: 23,
    });
    expect(result.evidence).not.toHaveProperty("telemetry");
    expect(writeExecutionResultMock).toHaveBeenCalledWith("/runs/run-001", expect.objectContaining({ telemetry: result.telemetry }));
  });

  it("records attempted worker timing on failure and omits skipped verification", async () => {
    runCodexWorkerMock.mockRejectedValue(new Error("worker failed"));
    const result = await executeTask(task, "/repositories/example");
    expect(result.telemetry!.workerDurationMs).toBeGreaterThanOrEqual(0);
    expect(result.telemetry!.cleanupDurationMs).toBeUndefined();
    expect(result.telemetry!.verificationDurationMs).toBeUndefined();
    for (const duration of Object.values(result.telemetry!)) expect(duration).toBeGreaterThanOrEqual(0);
  });
  it("returns complete evidence and scope after a successful ordered execution", async () => {
    const result = await executeTask(task, "/repositories/example");

    expect(result).toEqual({
      workspace: { path: "/tmp/execution-workspace" },
      telemetry: expect.any(Object),
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
      writeExecutionResultMock.mock.invocationCallOrder[0],
    );
    expect(removeExecutionWorkspaceMock).not.toHaveBeenCalled();
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
      telemetry: expect.any(Object),
      passed: false,
      evidence: {},
      failures: [{ stage: "workspace", message: "worktree creation failed" }],
      artifacts: { directory: "/runs/run-001" },
    });
    expect(runCodexWorkerMock).not.toHaveBeenCalled();
    expect(removeExecutionWorkspaceMock).not.toHaveBeenCalled();
    expect(writeExecutionResultMock).toHaveBeenCalledOnce();
  });

  it("records Worker failure, skips later stages, and retains workspace", async () => {
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
    expect(removeExecutionWorkspaceMock).not.toHaveBeenCalled();
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
      expect.any(Object),
      undefined,
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
    expect(removeExecutionWorkspaceMock).not.toHaveBeenCalled();
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
    expect(removeExecutionWorkspaceMock).not.toHaveBeenCalled();
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
    expect(removeExecutionWorkspaceMock).not.toHaveBeenCalled();
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
    expect(removeExecutionWorkspaceMock).not.toHaveBeenCalled();
  });

  it("keeps failed Verification and its workspace available for review", async () => {
    const verification = { passed: false, commands: [] };
    runVerificationMock.mockResolvedValue(verification);
    const result = await executeTask(task, "/repositories/example");
    expect(result.passed).toBe(false);
    expect(result.evidence.verification).toBe(verification);
    expect(result.workspace).toEqual({ path: "/tmp/execution-workspace" });
    expect(result.failures).toEqual([{ stage: "verification", message: "Verification failed." }]);
    expect(removeExecutionWorkspaceMock).not.toHaveBeenCalled();
  });

  it("does not let cleanup errors affect successful execution", async () => {
    removeExecutionWorkspaceMock.mockImplementation(() => { throw new Error("removal failed"); });
    const result = await executeTask(task, "/repositories/example");
    expect(result.passed).toBe(true);
    expect(result.workspace).toEqual({ path: "/tmp/execution-workspace" });
    expect(result.evidence.workerOutput).toBe("Codex final output");
    expect(result.failures).toEqual([]);
    expect(writeExecutionResultMock).toHaveBeenCalledWith("/runs/run-001", expect.objectContaining({ passed: true, workspace: result.workspace }));
    expect(removeExecutionWorkspaceMock).not.toHaveBeenCalled();
  });

  it("preserves Worker failure without attempting workspace cleanup", async () => {
    runCodexWorkerMock.mockRejectedValue(new Error("worker failed"));
    removeExecutionWorkspaceMock.mockImplementation(() => { throw new Error("cleanup failed"); });
    const result = await executeTask(task, "/repositories/example");
    expect(result.failures).toEqual([{ stage: "worker", message: "worker failed" }]);
    expect(result.workspace).toEqual({ path: "/tmp/execution-workspace" });
    expect(removeExecutionWorkspaceMock).not.toHaveBeenCalled();
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
    expect(removeExecutionWorkspaceMock).not.toHaveBeenCalled();
  });
});
