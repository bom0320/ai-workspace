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
  getRecordedWorkItemIntegrations,
  type WorkItemResult,
} from "@/application/governance/index.js";
import {
  fingerprintExecutionArtifacts,
  preserveExecutionChanges,
  writeExecutionResult,
} from "@/services/artifacts/index.js";
import { integrateWorkItemResults } from "./integrate-work-item-results.js";

vi.mock("@/application/governance/index.js", () => ({
  getRecordedWorkItemIntegrations: vi.fn(),
}));

type Recorded = ReturnType<
  typeof getRecordedWorkItemIntegrations
>["integrations"][number];
let directory: string;
let repositoryRoot: string;
let commitSha: string;
let temporaryArtifacts: string[];
const planId = "plan";
const git = (...args: string[]) =>
  execFileSync("git", args, { cwd: repositoryRoot, encoding: "utf8" });
const snapshot = () => ({ repositoryRoot, commitSha });

beforeEach(() => {
  vi.resetAllMocks();
  directory = mkdtempSync(join(tmpdir(), "work-item-integration-test-"));
  repositoryRoot = join(directory, "repo");
  temporaryArtifacts = [];
  mkdirSync(repositoryRoot);
  git("init", "--quiet");
  git("config", "user.name", "Integration Test");
  git("config", "user.email", "test@example.invalid");
  for (const path of ["a.txt", "b.txt"])
    writeFileSync(join(repositoryRoot, path), "original\n");
  git("add", ".");
  git("commit", "--quiet", "-m", "Approved base");
  commitSha = git("rev-parse", "HEAD").trim();
});

afterEach(() => {
  for (const path of [directory, ...temporaryArtifacts])
    rmSync(path, { recursive: true, force: true });
});

function read(workItemId: string): Recorded {
  return {
    result: {
      status: "read-integrated",
      workItemId,
      planId,
      snapshot: snapshot(),
      assignmentResults: [
        {
          status: "read-completed",
          assignmentId: workItemId,
          invocationId: workItemId,
          resultDigest: "assignment-digest",
        },
      ],
    },
    scopes: [],
    digest: `integrated-${workItemId}`,
  };
}

function write(workItemId: string, path: string, content: string): Recorded {
  const output = join(directory, workItemId);
  mkdirSync(output);
  const target = join(repositoryRoot, path);
  const original = readFileSync(target);
  try {
    writeFileSync(target, content);
    preserveExecutionChanges(repositoryRoot, output, commitSha);
  } finally {
    writeFileSync(target, original);
  }
  const { assignmentResults } = read(workItemId).result;
  const report = {
    status: "write-integrated" as const,
    planId,
    workItemId,
    snapshot: snapshot(),
    assignmentResults,
    changedPaths: [path],
    verification: { passed: true },
  };
  writeExecutionResult(output, report);
  const artifacts = fingerprintExecutionArtifacts(output);
  const result: WorkItemResult = {
    ...report,
    artifacts: { ...artifacts, patchDigest: artifacts.patchDigest! },
  };
  return {
    result,
    digest: `integrated-${workItemId}`,
    scopes: [
      {
        allowedPaths: [path],
        forbiddenPaths: [],
        verification: ["git diff --check"],
        deadlineMs: Date.now() + 30_000,
      },
    ],
  };
}

async function integrate(
  selectedWorkItemIds: string[],
  integrations: Recorded[],
  failedWorkItemIds: string[] = []
) {
  vi.mocked(getRecordedWorkItemIntegrations).mockReturnValue({
    plan: {
      id: planId,
      snapshot: snapshot(),
      selectedWorkItemIds,
      assignments: [],
      decompositionBinding: "decomposition",
      staffingBinding: "staffing",
    },
    integrations,
    failedWorkItemIds,
  });
  const before = git("worktree", "list", "--porcelain");
  const output = await integrateWorkItemResults({
    handoff: {} as Parameters<typeof integrateWorkItemResults>[0]["handoff"],
    planId,
  });
  if (output.status === "write-integrated")
    temporaryArtifacts.push(output.artifacts.directory);
  expect(git("worktree", "list", "--porcelain")).toBe(before);
  expect(git("status", "--porcelain")).toBe("");
  expect(git("rev-parse", "HEAD").trim()).toBe(commitSha);
  return output;
}

it("returns read references in registered order without a worktree artifact", async () => {
  expect(await integrate(["one", "two"], [read("two"), read("one")])).toEqual({
    status: "read-integrated",
    planId,
    snapshot: snapshot(),
    workItemResults: [
      {
        status: "read-integrated",
        workItemId: "one",
        digest: "integrated-one",
      },
      {
        status: "read-integrated",
        workItemId: "two",
        digest: "integrated-two",
      },
    ],
  });
});

it("combines independent Work Item patches and read sources, preserving source artifacts", async () => {
  const one = write("one", "a.txt", "one\n");
  const two = write("two", "b.txt", "two\n");
  const artifact = join(directory, "one", "changes.patch");
  const before = readFileSync(artifact);
  const result = await integrate(
    ["one", "read", "two"],
    [two, read("read"), one]
  );
  if (result.status !== "write-integrated")
    throw new Error(JSON.stringify(result));
  expect(result.workItemResults.map(({ workItemId }) => workItemId)).toEqual([
    "one",
    "read",
    "two",
  ]);
  expect(result.changedPaths).toEqual(["a.txt", "b.txt"]);
  expect(
    readFileSync(join(result.artifacts.directory, "changes.patch"), "utf8")
  ).toMatch(/\+one[\s\S]*\+two/);
  const report = JSON.parse(
    readFileSync(join(result.artifacts.directory, "result.json"), "utf8")
  );
  expect(
    report.verification.commands.map(
      ({ command }: { command: string }) => command
    )
  ).toEqual(["git diff --check"]);
  expect(readFileSync(artifact)).toEqual(before);
});

it("reports missing and failed Work Items separately", async () => {
  await expect(integrate(["one", "two"], [read("one")])).resolves.toMatchObject(
    {
      status: "pending",
      missingWorkItemIds: ["two"],
    }
  );
  await expect(
    integrate(["one", "two"], [read("one")], ["two"])
  ).resolves.toMatchObject({
    status: "failed",
    failure: "source",
  });
});

it("refuses duplicate, foreign Plan and foreign Snapshot results", async () => {
  const one = read("one");
  for (const entries of [
    [one, one],
    [{ ...one, result: { ...one.result, planId: "foreign" } }],
    [
      {
        ...one,
        result: {
          ...one.result,
          snapshot: { ...snapshot(), commitSha: "foreign" },
        },
      },
    ],
  ])
    await expect(integrate(["one"], entries)).resolves.toMatchObject({
      status: "failed",
      failure: "source",
    });
});

it("refuses tampered patch or report bytes", async () => {
  for (const [id, path] of [
    ["patch", "changes.patch"],
    ["report", "result.json"],
  ]) {
    const item = write(id, "a.txt", "updated\n");
    writeFileSync(join(directory, id, path), "tampered\n");
    await expect(integrate([id], [item])).resolves.toMatchObject({
      status: "failed",
      failure: "artifact",
    });
  }
});

it("rejects conflicts and does not borrow a different Work Item's approved paths", async () => {
  const one = write("one", "a.txt", "one\n");
  const two = write("two", "a.txt", "two\n");
  await expect(integrate(["one", "two"], [one, two])).resolves.toMatchObject({
    status: "failed",
    failure: "patch",
  });

  if (two.result.status !== "write-integrated")
    throw new Error("Missing write result");
  two.result.changedPaths = ["b.txt"];
  const reportPath = join(two.result.artifacts.directory, "result.json");
  const report = JSON.parse(readFileSync(reportPath, "utf8"));
  writeExecutionResult(two.result.artifacts.directory, {
    ...report,
    changedPaths: ["b.txt"],
  });
  two.result.artifacts.resultDigest = fingerprintExecutionArtifacts(
    two.result.artifacts.directory
  ).resultDigest;
  await expect(integrate(["two", "one"], [one, two])).resolves.toMatchObject({
    status: "failed",
    failure: "scope",
  });
});

it("publishes no successful result when the approved Git check fails", async () => {
  await expect(
    integrate(["one"], [write("one", "a.txt", "trailing space \n")])
  ).resolves.toMatchObject({
    status: "failed",
    failure: "verification",
  });
});
