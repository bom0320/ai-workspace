import { execFileSync } from "node:child_process";
import * as crypto from "node:crypto";
import {
  mkdtempSync,
  mkdirSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import * as gitInfrastructure from "@/infrastructure/git/index.js";
import * as snapshotService from "@/services/repository-snapshot/index.js";

import {
  runStaffing,
  validateStaffingProposal,
  staffingRunResultSchema,
  staffingProposalSchema,
  type CEOStaffingAgent,
  type RunStaffingOptions,
  type StaffingDraft,
} from "../index.js";

vi.mock("@/infrastructure/git/index.js", async (original) => ({
  ...(await original<typeof import("@/infrastructure/git/index.js")>()),
}));
vi.mock("@/services/repository-snapshot/index.js", async (original) => ({
  ...(await original<
    typeof import("@/services/repository-snapshot/index.js")
  >()),
}));
vi.mock("node:crypto", async (original) => ({
  ...(await original<typeof import("node:crypto")>()),
}));

let root: string;
let options: RunStaffingOptions;
let draft: StaffingDraft;
const git = (...args: string[]) =>
  execFileSync("git", args, {
    cwd: root,
    encoding: "utf8",
    stdio: "pipe",
  }).trim();
beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), "ai-workspace-proposal-"));
  git("init", "--quiet");
  git("config", "user.name", "Test");
  git("config", "user.email", "test@example.com");
  mkdirSync(join(root, "src"));
  writeFileSync(join(root, "src/a.ts"), "export const a = 1;\n");
  writeFileSync(join(root, "src/b.ts"), "export const b = 2;\n");
  writeFileSync(join(root, "private.txt"), "private\n");
  writeFileSync(join(root, ".env"), "TOKEN=private\n");
  writeFileSync(join(root, "binary.bin"), Buffer.from([0, 1, 2]));
  writeFileSync(join(root, "invalid.txt"), Buffer.from([0xff]));
  symlinkSync("src/a.ts", join(root, "link"));
  git("add", ".");
  git("commit", "--quiet", "-m", "initial");
  git(
    "update-index",
    "--add",
    "--cacheinfo",
    `160000,${git("rev-parse", "HEAD")},module`
  );
  git("commit", "--quiet", "-m", "gitlink");
  mkdirSync(join(root, "module"));
  draft = {
    intent: {
      problem: "Feedback",
      desiredOutcome: "Analysis",
      considerations: [],
      uncertainties: [],
    },
    assignments: [
      {
        specialistId: "frontend",
        objective: "Analyze",
        contextPaths: ["src/a.ts"],
        rationale: "Frontend experience",
      },
    ],
    budget: { maxAgentInvocations: 2 },
    rationale: "Focused analysis",
  };
  options = {
    goal: {
      objective: "Analyze feedback",
      targetRepository: "example",
      constraints: ["No edits"],
    },
    systemPolicy: {
      repositoryRoot: root,
      phase: "phase-a",
      availableSpecialists: [
        {
          id: "frontend",
          role: "Frontend",
          objective: "Frontend analysis",
          authority: { repositoryAccess: "read", shellExecution: false },
        },
        {
          id: "ux",
          role: "UX",
          objective: "UX analysis",
          authority: { repositoryAccess: "read", shellExecution: false },
        },
      ],
      allowedContextPaths: ["src/a.ts", "src/b.ts"],
      limits: {
        maxFilesPerRequest: 2,
        maxTotalFiles: 3,
        maxFileBytes: 65536,
        maxContextBytes: 131072,
        maxFileTreeEntries: 20,
      },
      maxAgentInvocations: 4,
    },
    maxRounds: 3,
    agent: vi.fn<CEOStaffingAgent>(async () => ({ type: "propose", draft })),
  };
});
afterEach(() => {
  vi.restoreAllMocks();
  rmSync(root, { recursive: true, force: true });
});

function addUX() {
  draft.assignments.push({
    ...draft.assignments[0],
    specialistId: "ux",
    objective: "Review usability",
  });
}

describe("runStaffing — same-run finalization, not authorization", () => {
  it("preserves the original Goal/Snapshot and Draft, issues unique IDs only after validation, without rerunning the CEO", async () => {
    addUX();
    const capture = vi.spyOn(snapshotService, "captureRepositorySnapshot");
    const ids = vi.spyOn(crypto, "randomUUID");
    const goal = structuredClone(options.goal);
    const before = structuredClone(draft);
    const sha = git("rev-parse", "HEAD");
    const result = await runStaffing(options);
    expect(result.status).toBe("proposed");
    if (result.status !== "proposed") throw new Error("Expected finalization");
    expect(staffingRunResultSchema.parse(result)).toEqual(result);
    expect(staffingProposalSchema.parse(result.proposal)).toEqual(
      result.proposal
    );
    expect(result.rounds).toBe(1);
    expect(result).not.toHaveProperty("draft");
    expect(result).not.toHaveProperty("state");
    expect(
      staffingRunResultSchema.safeParse({
        status: "proposed",
        draft,
        rounds: 1,
      }).success
    ).toBe(false);
    expect(options.agent).toHaveBeenCalledTimes(1);
    expect(capture).toHaveBeenCalledTimes(1);
    expect(result.proposal.snapshot).toEqual(capture.mock.results[0].value);
    expect(result.proposal.snapshot).toEqual({
      repositoryRoot: root,
      commitSha: sha,
    });
    expect(result.proposal.goal).toEqual(goal);
    expect(result.proposal.id).toMatch(/^proposal-/);
    expect(
      new Set(
        result.proposal.assignments.map(({ assignmentId }) => assignmentId)
      ).size
    ).toBe(2);
    expect(ids).toHaveBeenCalledTimes(3);
    expect(
      result.proposal.assignments.map(
        ({ assignmentId: _id, ...assignment }) => assignment
      )
    ).toEqual(before.assignments);
    expect(result.proposal.intent).toEqual(before.intent);
    expect(result.proposal.budget).toEqual(before.budget);
    expect(draft).toEqual(before);
    expect(result).not.toHaveProperty("unverifiedHumanConstraints");
    expect(result.proposal).not.toHaveProperty("approvalRecordId");
    expect(result.proposal).not.toHaveProperty("scope");
    expect(result.proposal).not.toHaveProperty("invocation");
    expect(git("status", "--porcelain")).toBe("");
    expect(git("rev-parse", "HEAD")).toBe(sha);
  });

  it("carries updated private state through inspect → propose with one capture", async () => {
    const capture = vi.spyOn(snapshotService, "captureRepositorySnapshot");
    options.agent = vi
      .fn<CEOStaffingAgent>()
      .mockResolvedValueOnce({
        type: "inspect",
        paths: ["src/a.ts"],
        reason: "Evidence",
      })
      .mockImplementationOnce(async (context) => {
        expect(context.inspectedFiles.map(({ path }) => path)).toEqual([
          "src/a.ts",
        ]);
        return { type: "propose", draft };
      });
    expect(await runStaffing(options)).toMatchObject({
      status: "proposed",
      rounds: 2,
    });
    expect(capture).toHaveBeenCalledTimes(1);
    expect(options.agent).toHaveBeenCalledTimes(2);
  });

  it("isolates original inputs/registration/policy from caller and Agent mutations during an await", async () => {
    const originalGoal = structuredClone(options.goal);
    options.agent = async (context) => {
      context.goal.objective = "CEO overwrite";
      options.goal.objective = "Caller overwrite";
      options.goal.constraints = [];
      options.systemPolicy.maxAgentInvocations = 0;
      options.systemPolicy.availableSpecialists = [];
      options.systemPolicy.allowedContextPaths = [];
      return { type: "propose", draft };
    };
    const result = await runStaffing(options);
    expect(result.status).toBe("proposed");
    if (result.status === "proposed")
      expect(result.proposal.goal).toEqual(originalGoal);
  });

  it.each([
    "unknown",
    "duplicate",
    "write-authority",
    "shell-authority",
    "budget",
    "duplicate-path",
  ])("rejects %s before reading blobs or issuing IDs", async (kind) => {
    if (kind === "unknown") draft.assignments[0].specialistId = "invented";
    if (kind === "duplicate")
      draft.assignments.push(structuredClone(draft.assignments[0]));
    if (kind === "write-authority")
      options.systemPolicy.availableSpecialists[0].authority.repositoryAccess =
        "write";
    if (kind === "shell-authority")
      options.systemPolicy.availableSpecialists[0].authority.shellExecution = true;
    if (kind === "budget") draft.budget.maxAgentInvocations = 5;
    if (kind === "duplicate-path")
      draft.assignments[0].contextPaths.push("src/a.ts");
    const read = vi.spyOn(gitInfrastructure, "readRepositoryFileAtCommit");
    const ids = vi.spyOn(crypto, "randomUUID");
    expect(await runStaffing(options)).toMatchObject({
      status: "failed",
      failure: kind.endsWith("authority")
        ? "invalid-input"
        : "policy-validation",
      rounds: kind.endsWith("authority") ? 0 : 1,
    });
    expect(read).not.toHaveBeenCalled();
    expect(ids).not.toHaveBeenCalled();
  });

  it.each([
    "private.txt",
    "missing.ts",
    "/absolute",
    "../outside",
    "src/./a.ts",
    ".env",
    "link",
    "module",
    "src",
  ])(
    "rejects forbidden, unsafe, missing or non-regular Context %s",
    async (path) => {
      if (["missing.ts", ".env", "link", "module", "src"].includes(path))
        options.systemPolicy.allowedContextPaths!.push(path);
      draft.assignments[0].contextPaths = ["src/a.ts", path];
      const read = vi.spyOn(gitInfrastructure, "readRepositoryFileAtCommit");
      expect(await runStaffing(options)).toMatchObject({
        status: "failed",
        failure: "policy-validation",
      });
      expect(read).not.toHaveBeenCalled();
    }
  );

  it.each(["binary.bin", "invalid.txt"])(
    "rejects non-text Snapshot content %s",
    async (path) => {
      options.systemPolicy.allowedContextPaths!.push(path);
      draft.assignments[0].contextPaths = [path];
      const result = await runStaffing(options);
      expect(result).toMatchObject({
        status: "failed",
        failure: "policy-validation",
      });
      expect(result).not.toHaveProperty("proposal");
    }
  );

  it.each([
    "maxFileBytes",
    "maxFilesPerRequest",
    "maxTotalFiles",
    "maxContextBytes",
  ] as const)("enforces %s for proposal Context", async (limit) => {
    if (limit === "maxContextBytes") {
      // Discovery fits; finalization's complete file contents do not.
      writeFileSync(join(root, "src/a.ts"), "x".repeat(5000));
      git("add", ".");
      git("commit", "--quiet", "-m", "larger");
      options.systemPolicy.limits.maxContextBytes = 2000;
    } else if (limit === "maxFileBytes")
      options.systemPolicy.limits.maxFileBytes = 1;
    else options.systemPolicy.limits[limit] = 0;
    expect(await runStaffing(options)).toMatchObject({
      status: "failed",
      failure: "policy-validation",
    });
  });

  it("rechecks actual JSON Context bytes after escaping, before issuing IDs", async () => {
    writeFileSync(join(root, "src/a.ts"), '\"'.repeat(700));
    git("add", ".");
    git("commit", "--quiet", "-m", "escaped text");
    options.systemPolicy.limits.maxContextBytes = 2000;
    const read = vi.spyOn(gitInfrastructure, "readRepositoryFileAtCommit");
    const ids = vi.spyOn(crypto, "randomUUID");
    expect(await runStaffing(options)).toMatchObject({
      status: "failed",
      failure: "policy-validation",
    });
    expect(read).toHaveBeenCalledTimes(1);
    expect(ids).not.toHaveBeenCalled();
  });

  it("validates System settings without claiming semantic proof of Human instructions", async () => {
    const result = await runStaffing(options);
    expect(result.status).toBe("proposed");
    if (result.status !== "proposed") throw new Error("Expected Proposal");
    expect(result.proposal.goal.constraints).toEqual(options.goal.constraints);
    expect(result).not.toHaveProperty("unverifiedHumanConstraints");
    expect(
      staffingRunResultSchema.safeParse({
        ...result,
        unverifiedHumanConstraints: [],
      }).success
    ).toBe(false);
  });

  it.each(["files", "bytes", "json", "specialist", "context", "budget"])(
    "revalidates a Proposal without CEO state and rejects %s policy violations",
    async (kind) => {
      if (kind === "json") {
        writeFileSync(join(root, "src/a.ts"), '"'.repeat(700));
        git("add", ".");
        git("commit", "--quiet", "-m", "escaped context");
      }
      const result = await runStaffing(options);
      if (result.status !== "proposed") throw new Error(JSON.stringify(result));
      const configuration = structuredClone(options.systemPolicy);
      expect(() =>
        validateStaffingProposal(result.proposal, configuration)
      ).not.toThrow();
      if (kind === "files") configuration.limits.maxTotalFiles = 0;
      if (kind === "bytes") configuration.limits.maxFileBytes = 1;
      if (kind === "json") configuration.limits.maxContextBytes = 2000;
      if (kind === "specialist") configuration.availableSpecialists = [];
      if (kind === "context") configuration.allowedContextPaths = [];
      if (kind === "budget") configuration.maxAgentInvocations = 1;
      expect(() =>
        validateStaffingProposal(result.proposal, configuration)
      ).toThrow();
    }
  );

  it("uses directory access for Finalization and Approval revalidation without widening assignment paths", async () => {
    options.systemPolicy.allowedContextPaths = [];
    options.systemPolicy.contextAccessPolicy = {
      allowedScopes: [{ kind: "directory", path: "src" }],
    };
    const result = await runStaffing(options);
    expect(result.status).toBe("proposed");
    if (result.status !== "proposed") throw new Error(JSON.stringify(result));
    expect(result.proposal.assignments[0].contextPaths).toEqual(["src/a.ts"]);
    const configuration = structuredClone(options.systemPolicy);
    expect(() =>
      validateStaffingProposal(result.proposal, configuration)
    ).not.toThrow();
    const outside = structuredClone(result.proposal);
    outside.assignments[0].contextPaths = ["src-other/a.ts"];
    expect(() => validateStaffingProposal(outside, configuration)).toThrow();
    draft.assignments[0].contextPaths = ["src-other/a.ts"];
    expect(await runStaffing(options)).toMatchObject({
      status: "failed",
      failure: "policy-validation",
    });
  });
  it("rejects old nested policy/rules and invalid System settings before calling the CEO", async () => {
    const obsolete = {
      ...options.systemPolicy,
      policy: {
        maxAgentInvocations: 4,
        enforcementRules: [
          { type: "specialists", allowedSpecialistIds: ["ux"] },
        ],
      },
    };
    expect(
      await runStaffing({ ...options, systemPolicy: obsolete })
    ).toMatchObject({ status: "failed", failure: "invalid-input", rounds: 0 });
    expect(options.agent).not.toHaveBeenCalled();
    options.systemPolicy.maxAgentInvocations = 0;
    expect(await runStaffing(options)).toMatchObject({
      status: "failed",
      failure: "invalid-input",
      rounds: 0,
    });
  });

  it("passes every original Human instruction to the CEO and preserves it in the Proposal", async () => {
    options.goal.constraints = [
      " No edits ",
      "Prefer accessible feedback",
      " No edits ",
    ];
    const originalGoal = structuredClone(options.goal);
    options.agent = vi.fn<CEOStaffingAgent>(async (context) => {
      expect(context.goal).toEqual(originalGoal);
      expect(context).not.toHaveProperty("policy");
      expect(context).not.toHaveProperty("enforcementRules");
      return { type: "propose", draft };
    });
    const result = await runStaffing(options);
    expect(result.status).toBe("proposed");
    if (result.status !== "proposed") throw new Error("Expected Proposal");
    expect(result.proposal.goal).toEqual(originalGoal);
    expect(options.goal).toEqual(originalGoal);
    // Policy success makes no claim that "Prefer accessible feedback" was met.
    expect(Object.keys(result).sort()).toEqual([
      "proposal",
      "rounds",
      "status",
    ]);
  });

  it("enforces policies even without any Human Constraint strings", async () => {
    delete options.goal.constraints;
    expect(await runStaffing(options)).toMatchObject({ status: "proposed" });
    options.systemPolicy.maxAgentInvocations = 1;
    expect(await runStaffing(options)).toMatchObject({
      status: "failed",
      failure: "policy-validation",
    });
  });

  it("preserves Human clarification as escalation without treating policy as instruction resolution", async () => {
    options.goal.constraints = ["Keep current flow", "Replace current flow"];
    options.agent = vi.fn<CEOStaffingAgent>(async (context) => {
      expect(context.goal.constraints).toEqual(options.goal.constraints);
      return {
        type: "escalate",
        reason: "Conflicting Human instructions",
        questions: ["Which flow direction should take priority?"],
      };
    });
    const ids = vi.spyOn(crypto, "randomUUID");
    const result = await runStaffing(options);
    expect(result).toEqual({
      status: "escalated",
      reason: "Conflicting Human instructions",
      questions: ["Which flow direction should take priority?"],
      rounds: 1,
    });
    expect(staffingRunResultSchema.parse(result)).toEqual(result);
    expect(ids).not.toHaveBeenCalled();
  });

  it("rejects competing operating settings outside systemPolicy", async () => {
    expect(
      await runStaffing({
        ...options,
        policy: { maxAgentInvocations: 1, enforcementRules: [] },
      } as RunStaffingOptions)
    ).toMatchObject({ status: "failed", failure: "invalid-input", rounds: 0 });
    expect(options.agent).not.toHaveBeenCalled();
  });

  it("rejects obsolete top-level constraintRules rather than silently ignoring them", async () => {
    // @ts-expect-error Obsolete rules must fail closed, not be ignored.
    options.systemPolicy.enforcementRules = [];
    expect(await runStaffing(options)).toMatchObject({
      status: "failed",
      failure: "invalid-input",
      rounds: 0,
    });
    expect(options.agent).not.toHaveBeenCalled();
  });

  it("rejects duplicate Harness registry IDs before the CEO", async () => {
    options.systemPolicy.availableSpecialists.push(
      structuredClone(options.systemPolicy.availableSpecialists[0])
    );
    expect(await runStaffing(options)).toMatchObject({
      status: "failed",
      failure: "invalid-input",
      rounds: 0,
    });
    expect(options.agent).not.toHaveBeenCalled();
  });

  it.each([
    "goal",
    "snapshot",
    "id",
    "authority",
    "assignmentId",
    "policy",
    "enforcementRules",
  ])("rejects CEO injection of %s", async (field) => {
    options.agent = async () => ({
      type: "propose",
      draft:
        field === "assignmentId"
          ? {
              ...draft,
              assignments: [
                { ...draft.assignments[0], assignmentId: "CEO-id" },
              ],
            }
          : { ...draft, [field]: "CEO-owned" },
    });
    expect(await runStaffing(options)).toMatchObject({
      status: "failed",
      failure: "schema-validation",
    });
  });

  it("does not treat caller-supplied Draft/ContextState as a trusted Run", async () => {
    const agent = vi.fn<CEOStaffingAgent>(async () => ({
      type: "escalate",
      reason: "Human choice",
      questions: ["Which direction?"],
    }));
    const result = await runStaffing({
      ...options,
      agent,
      draft,
      state: { snapshot: { repositoryRoot: "/fake", commitSha: "fake" } },
    } as RunStaffingOptions);
    expect(result).toEqual({
      status: "escalated",
      reason: "Human choice",
      questions: ["Which direction?"],
      rounds: 1,
    });
    expect(agent).toHaveBeenCalledOnce();
  });

  it.each(["HEAD", "dirty"])(
    "fails when %s changes during CEO execution",
    async (kind) => {
      options.agent = async () => {
        if (kind === "HEAD")
          git("commit", "--quiet", "--allow-empty", "-m", "drift");
        else writeFileSync(join(root, "private.txt"), "dirty");
        return { type: "propose", draft };
      };
      expect(await runStaffing(options)).toMatchObject({
        status: "failed",
        failure: "snapshot-drift",
      });
    }
  );

  it("checks Snapshot after finalization blob loading and returns no partial Proposal", async () => {
    const original = gitInfrastructure.readRepositoryFileAtCommit;
    vi.spyOn(
      gitInfrastructure,
      "readRepositoryFileAtCommit"
    ).mockImplementation((...args) => {
      const text = original(...args);
      git(
        "commit",
        "--quiet",
        "--allow-empty",
        "-m",
        "drift during validation"
      );
      return text;
    });
    const ids = vi.spyOn(crypto, "randomUUID");
    const result = await runStaffing(options);
    expect(result).toMatchObject({
      status: "failed",
      failure: "snapshot-drift",
    });
    expect(result).not.toHaveProperty("proposal");
    expect(ids).not.toHaveBeenCalled();
  });

  it("rejects generated Assignment ID collisions", async () => {
    addUX();
    vi.spyOn(crypto, "randomUUID").mockReturnValue(
      "00000000-0000-4000-8000-000000000000"
    );
    expect(await runStaffing(options)).toMatchObject({
      status: "failed",
      failure: "policy-validation",
    });
  });

  it("preserves inspection failures and round limits without IDs", async () => {
    options.agent = async () => ({
      type: "inspect",
      paths: ["private.txt"],
      reason: "Need info",
    });
    expect(await runStaffing(options)).toMatchObject({
      status: "failed",
      failure: "inspection",
      rounds: 1,
    });
    options.maxRounds = 1;
    expect(await runStaffing(options)).toMatchObject({
      status: "failed",
      failure: "round-limit",
      rounds: 1,
    });
  });
});
