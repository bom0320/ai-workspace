import { execFileSync } from "node:child_process";
import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import {
  getAssignmentExecutionResults,
  getPreparedAssignmentPlan,
} from "@/application/governance/index.js";
import {
  fingerprintExecutionArtifacts,
  preserveExecutionChanges,
  writeExecutionResult,
} from "@/services/artifacts/index.js";
import { applyWorkspacePatch } from "@/infrastructure/git/index.js";
import { integrateAssignmentResults } from "./integrate-assignment-results.js";

vi.mock("@/application/governance/index.js", () => ({
  getPreparedAssignmentPlan: vi.fn(),
  getAssignmentExecutionResults: vi.fn(),
}));

let repository: string;
let root: string;
let commitSha: string;
const outputs: string[] = [];
const git = (...args: string[]) =>
  execFileSync("git", args, { cwd: repository, encoding: "utf8" });

beforeEach(() => {
  vi.resetAllMocks();
  root = mkdtempSync(join(tmpdir(), "assignment-integration-test-"));
  repository = join(root, "repo");
  mkdirSync(repository);
  git("init", "--quiet");
  git("config", "user.name", "Integration Test");
  git("config", "user.email", "test@example.invalid");
  for (const path of ["a.txt", "b.txt"])
    writeFileSync(join(repository, path), "original\n");
  git("add", ".");
  git("commit", "--quiet", "-m", "Approved base");
  commitSha = git("rev-parse", "HEAD").trim();
});

afterEach(() => {
  for (const directory of outputs.splice(0))
    rmSync(directory, { recursive: true, force: true });
  rmSync(root, { recursive: true, force: true });
});

function writeResult(assignmentId: string, path: string, content: string) {
  const directory = join(root, assignmentId);
  mkdirSync(directory);
  const target = join(repository, path);
  const original = readFileSync(target);
  try {
    writeFileSync(target, content);
    preserveExecutionChanges(repository, directory, commitSha);
  } finally {
    writeFileSync(target, original);
  }
  writeExecutionResult(directory, { artifacts: { baseCommit: commitSha } });
  return {
    status: "write-completed" as const,
    assignmentId,
    workItemId: "work",
    specialistId: "specialist",
    invocationId: assignmentId,
    resultDigest: `digest-${assignmentId}`,
    taskContractBinding: `binding-${assignmentId}`,
    artifacts: fingerprintExecutionArtifacts(directory),
    integrationScope: {
      allowedPaths: [path],
      forbiddenPaths: [],
      verification: ["git diff --check"],
      deadlineMs: Date.now() + 60_000,
    },
  };
}
const readResult = {
  status: "read-completed" as const,
  assignmentId: "analysis",
  workItemId: "work",
  invocationId: "read",
  resultDigest: "read-digest",
};
async function integrate(
  assignmentIds: string[],
  results: ReturnType<typeof getAssignmentExecutionResults>
) {
  vi.mocked(getPreparedAssignmentPlan).mockReturnValue({
    plan: {
      id: "plan",
      decompositionBinding: "decomposition",
      staffingBinding: "staffing",
      snapshot: { repositoryRoot: repository, commitSha },
      selectedWorkItemIds: ["work"],
      assignments: assignmentIds.map((id) => ({
        id,
        workItemId: "work",
        specialistId: "specialist",
        objective: id,
        deliverable: id,
        dependsOn: [],
        repositoryAccessCeiling: id === "analysis" ? "read" : "write",
      })),
    },
    workItems: [],
    specialistSources: [],
  });
  vi.mocked(getAssignmentExecutionResults).mockReturnValue(results);
  const before = git("worktree", "list", "--porcelain");
  const output = await integrateAssignmentResults({
    handoff: {} as Parameters<typeof integrateAssignmentResults>[0]["handoff"],
    planId: "plan",
    workItemId: "work",
  });
  if (output.status === "write-integrated")
    outputs.push(output.artifacts.directory);
  expect(git("worktree", "list", "--porcelain")).toBe(before);
  expect(git("status", "--porcelain")).toBe("");
  expect(git("rev-parse", "HEAD").trim()).toBe(commitSha);
  return output;
}

it("integrates only the analysis reference for a read-only Work Item", async () => {
  await expect(integrate(["analysis"], [readResult])).resolves.toMatchObject({
    status: "read-integrated",
    assignmentResults: [
      {
        assignmentId: "analysis",
        invocationId: "read",
        resultDigest: "read-digest",
      },
    ],
  });
});

it("integrates a single Write result and records approved verification", async () => {
  const output = await integrate(
    ["first"],
    [writeResult("first", "a.txt", "first\n")]
  );
  expect(output.status).toBe("write-integrated");
  if (output.status !== "write-integrated")
    throw new Error(JSON.stringify(output));
  expect(
    readFileSync(join(output.artifacts.directory, "base-commit.txt"), "utf8")
  ).toBe(`${commitSha}\n`);
  expect(
    JSON.parse(
      readFileSync(join(output.artifacts.directory, "result.json"), "utf8")
    )
  ).toMatchObject({
    verification: { passed: true, commands: [{ command: "git diff --check" }] },
  });
});

it("combines independent patches and retains the read reference in registered order", async () => {
  const a = writeResult("first", "a.txt", "first\n");
  const b = writeResult("second", "b.txt", "second\n");
  const output = await integrate(
    ["first", "analysis", "second"],
    [b, readResult, a]
  );
  if (output.status !== "write-integrated")
    throw new Error(JSON.stringify(output));
  expect(
    output.assignmentResults.map(({ assignmentId }) => assignmentId)
  ).toEqual(["first", "analysis", "second"]);
  expect(
    readFileSync(join(output.artifacts.directory, "changes.patch"), "utf8")
  ).toMatch(/\+first[\s\S]*\+second/);
  expect(
    readFileSync(join(a.artifacts.directory, "changes.patch"), "utf8")
  ).not.toContain("+second");
});

it("discards a conflicting integration without publishing a successful result", async () => {
  const a = writeResult("first", "a.txt", "first\n");
  const b = writeResult("second", "a.txt", "second\n");
  await expect(integrate(["first", "second"], [a, b])).resolves.toMatchObject({
    status: "failed",
    failure: "patch",
  });
});

it("blocks tampered patches, wrong bases, and changes outside the individual scope", async () => {
  const result = writeResult("first", "a.txt", "first\n");
  result.integrationScope.allowedPaths = ["b.txt"];
  await expect(integrate(["first"], [result])).resolves.toMatchObject({
    status: "failed",
    failure: "scope",
  });
  const reportDirectory = result.artifacts.directory;
  writeFileSync(join(reportDirectory, "base-commit.txt"), "other\n");
  await expect(integrate(["first"], [result])).resolves.toMatchObject({
    status: "failed",
    failure: "artifact",
  });
  writeFileSync(join(reportDirectory, "base-commit.txt"), `${commitSha}\n`);
  writeFileSync(join(reportDirectory, "changes.patch"), "tampered\n");
  await expect(integrate(["first"], [result])).resolves.toMatchObject({
    status: "failed",
    failure: "artifact",
  });
});

it("leaves missing or prepared Assignments pending", async () => {
  await expect(integrate(["first"], [])).resolves.toMatchObject({
    status: "pending",
  });
  await expect(
    integrate(
      ["first"],
      [
        {
          assignmentId: "first",
          workItemId: "work",
          invocationId: "prepared",
          status: "task-prepared",
          planFormat: "structured",
          resultDigest: "digest",
          taskContractBinding: "binding",
        },
      ]
    )
  ).resolves.toMatchObject({ status: "pending" });
});

it("discards an integration that fails the approved Git check", async () => {
  const result = writeResult("first", "a.txt", "trailing space \n");
  await expect(integrate(["first"], [result])).resolves.toMatchObject({
    status: "failed",
    failure: "verification",
  });
});

it("rejects the original repository at the integration patch boundary", () => {
  const result = writeResult("first", "a.txt", "first\n");
  const patch = readFileSync(join(result.artifacts.directory, "changes.patch"));
  expect(() => applyWorkspacePatch(repository, patch, () => 5000)).toThrow(
    "Patch application requires a separate linked worktree."
  );
  expect(git("status", "--porcelain")).toBe("");
});
