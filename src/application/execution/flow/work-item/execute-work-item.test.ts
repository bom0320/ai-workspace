import { beforeEach, expect, it, vi } from "vitest";
import * as execution from "../../index.js";
import {
  authorizeExecutionForRun,
  type ExecutionRequest,
} from "@/application/governance/index.js";
import { checkGovernedWorkerRuntime } from "../check-execution-runtime.js";
import { runExecutionPipeline } from "../orchestration/run-execution-pipeline.js";

vi.mock("@/application/governance/index.js", async (importOriginal) => ({
  ...(await importOriginal<
    typeof import("@/application/governance/index.js")
  >()),
  authorizeExecutionForRun: vi.fn(),
}));
vi.mock("../check-execution-runtime.js", () => ({
  checkGovernedWorkerRuntime: vi.fn(),
}));
vi.mock("../orchestration/run-execution-pipeline.js", () => ({
  runExecutionPipeline: vi.fn(),
}));

const digest = "a".repeat(64);
const request: ExecutionRequest = {
  approvedDecisionId: "decision",
  executionSourceId: digest,
  workItem: {
    id: "work",
    objective: "Update docs",
    deliverable: "Docs",
    dependsOn: [],
  },
  task: {
    id: "task",
    goalId: "goal",
    objective: "Update docs",
    targetRepository: "repository",
    allowedPaths: ["README.md"],
    forbiddenPaths: [],
    constraints: [],
    acceptanceCriteria: ["Docs updated"],
    verification: ["git diff --check"],
  },
  repositoryPath: "/repository",
  readPaths: ["README.md"],
  timeoutMs: 1_000,
};
const codexRequest = { ...request, workerMode: "codex-worktree" as const };

beforeEach(() => {
  vi.resetAllMocks();
  vi.mocked(checkGovernedWorkerRuntime).mockReturnValue({
    status: "supported",
    temporaryRoot: "/tmp",
  });
});

it("exposes only approved execution use cases at runtime", () => {
  expect(Object.keys(execution).sort()).toEqual([
    "executeAssignmentRead",
    "executeReadOnlyWorkItem",
    "executeWorkItem",
  ]);
});

it("rejects invalid input before runtime or authorization", async () => {
  await expect(execution.executeWorkItem(request.task)).resolves.toMatchObject({
    status: "denied",
  });
  expect(checkGovernedWorkerRuntime).not.toHaveBeenCalled();
  expect(authorizeExecutionForRun).not.toHaveBeenCalled();
  expect(runExecutionPipeline).not.toHaveBeenCalled();
});

it("blocks unsupported runtime without consuming an authorization", async () => {
  vi.mocked(checkGovernedWorkerRuntime).mockReturnValue({
    status: "blocked",
    reason: "Unsupported host",
  });
  await expect(execution.executeWorkItem(request)).resolves.toEqual({
    status: "blocked",
    reason: "Unsupported host",
    workItemId: "work",
  });
  expect(authorizeExecutionForRun).not.toHaveBeenCalled();
  expect(runExecutionPipeline).not.toHaveBeenCalled();
});

it.each(["denied", "approval-required"] as const)(
  "stops before Worker execution when authorization returns %s",
  async (status) => {
    vi.mocked(authorizeExecutionForRun).mockReturnValue({
      status,
      reason: "Authorization unavailable",
    });
    await expect(execution.executeWorkItem(request)).resolves.toEqual({
      status,
      reason: "Authorization unavailable",
      workItemId: "work",
    });
    expect(checkGovernedWorkerRuntime).toHaveBeenCalledWith(codexRequest);
    expect(authorizeExecutionForRun).toHaveBeenCalledExactlyOnceWith(
      codexRequest
    );
    expect(runExecutionPipeline).not.toHaveBeenCalled();
  }
);

it.each([true, false])(
  "attributes an attempted execution with passed=%s to the Work Item",
  async (passed) => {
    const authorized = {
      id: "execution",
      request: codexRequest,
      snapshot: { repositoryRoot: "/repository", commitSha: "approved-commit" },
      delegationId: "delegation",
      delegationBinding: digest,
      policyVersion: 1,
      policyBinding: digest,
      expiresAt: "2030-01-01T00:00:00Z",
    };
    const result = {
      passed,
      evidence: {},
      failures: passed
        ? []
        : [{ stage: "worker" as const, message: "Worker failed" }],
    };
    vi.mocked(authorizeExecutionForRun).mockReturnValue({
      status: "authorized",
      execution: authorized,
    });
    vi.mocked(runExecutionPipeline).mockResolvedValue(result);

    await expect(execution.executeWorkItem(request)).resolves.toEqual({
      status: "executed",
      workItemId: "work",
      result,
    });
    expect(authorizeExecutionForRun).toHaveBeenCalledExactlyOnceWith(
      codexRequest
    );
    expect(runExecutionPipeline).toHaveBeenCalledExactlyOnceWith(
      authorized,
      "/tmp"
    );
    expect(
      vi.mocked(authorizeExecutionForRun).mock.invocationCallOrder[0]
    ).toBeLessThan(vi.mocked(runExecutionPipeline).mock.invocationCallOrder[0]);
  }
);
