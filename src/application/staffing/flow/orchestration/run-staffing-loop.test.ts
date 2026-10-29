import { execFileSync } from "node:child_process";
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { runCommand } from "@/infrastructure/process/index.js";
import * as gitInfrastructure from "@/infrastructure/git/index.js";

import {
  type CEOStaffingAgent,
  type CEOStaffingDecision,
  type StaffingContext,
  type StaffingDraft,
} from "../../index.js";

vi.mock("@/infrastructure/process/index.js", () => ({ runCommand: vi.fn() }));
vi.mock("@/infrastructure/git/index.js", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/infrastructure/git/index.js")>()),
}));

import {
  runStaffingLoop,
  type StaffingLoopOptions,
} from "./run-staffing-loop.js";

let root: string;
let options: StaffingLoopOptions;
const git = (...args: string[]) =>
  execFileSync("git", args, { cwd: root, encoding: "utf8", stdio: "pipe" });
const draft: StaffingDraft = {
  intent: {
    problem: "Login feedback",
    desiredOutcome: "Review feedback",
    considerations: [],
    uncertainties: [],
  },
  assignments: [
    {
      specialistId: "frontend",
      objective: "Review login",
      contextPaths: ["src/login.ts"],
      rationale: "Frontend expertise",
    },
  ],
  budget: { maxAgentInvocations: 2 },
  rationale: "One analysis Specialist",
};
const propose: CEOStaffingDecision = { type: "propose", draft };
const escalate: CEOStaffingDecision = {
  type: "escalate",
  reason: "Need Human choice",
  questions: ["Which login flow?"],
};
const inspect = (path: string): CEOStaffingDecision => ({
  type: "inspect",
  paths: [path],
  reason: "Need evidence",
});

beforeEach(() => {
  vi.mocked(runCommand).mockReset();
  root = mkdtempSync(join(tmpdir(), "ai-workspace-staffing-run-"));
  git("init", "--quiet");
  git("config", "user.name", "Test");
  git("config", "user.email", "test@example.com");
  mkdirSync(join(root, "src"));
  writeFileSync(join(root, "src/login.ts"), "export const login = true;\n");
  writeFileSync(join(root, "src/other.ts"), "export const other = true;\n");
  writeFileSync(join(root, "private.txt"), "private data");
  git("add", ".");
  git("commit", "--quiet", "-m", "fixture");
  options = {
    goal: {
      objective: "Analyze login feedback",
      targetRepository: "example",
      constraints: ["No edits"],
    },
    repositoryPath: root,
    availableSpecialists: [
      {
        id: "frontend",
        role: "Frontend",
        objective: "Review frontend",
        authority: { repositoryAccess: "read", shellExecution: false },
      },
    ],
    allowedContextPaths: ["src/login.ts", "src/other.ts"],
    limits: {
      maxFilesPerRequest: 2,
      maxTotalFiles: 2,
      maxFileBytes: 65536,
      maxContextBytes: 131072,
      maxFileTreeEntries: 10,
    },
    maxRounds: 3,
  };
});
afterEach(() => {
  vi.restoreAllMocks();
  rmSync(root, { recursive: true, force: true });
});

function agentSequence(...decisions: CEOStaffingDecision[]) {
  let index = 0;
  return vi.fn<CEOStaffingAgent>(async () => decisions[index++]);
}

describe("runStaffingLoop — draft / escalation only", () => {
  it("calls the CEO with only a cloned projection and proposes immediately in one round", async () => {
    const before = structuredClone(options);
    const agent = agentSequence(propose);
    const result = await runStaffingLoop({ ...options, agent });
    expect(result).toMatchObject({ status: "proposed", draft, rounds: 1 });
    const context = agent.mock.calls[0][0];
    expect(context.goal).toEqual(options.goal);
    expect(context.repository.commitSha).toBe(git("rev-parse", "HEAD").trim());
    expect(context.inspectedFiles).toEqual([]);
    expect(context.availableSpecialists).toEqual([
      { id: "frontend", role: "Frontend", objective: "Review frontend" },
    ]);
    expect(context).not.toHaveProperty("snapshot");
    expect(context).not.toHaveProperty("allowedContextPaths");
    expect(context).not.toHaveProperty("files");
    expect(JSON.stringify(context)).not.toContain(root);
    expect(result).not.toHaveProperty("invocation");
    expect(result).not.toHaveProperty("id");
    expect(options).toEqual(before);
  });

  it("updates Context through multiple inspections before proposing", async () => {
    const agent = agentSequence(
      inspect("src/login.ts"),
      inspect("src/other.ts"),
      propose
    );
    const result = await runStaffingLoop({ ...options, agent });
    expect(result).toMatchObject({ status: "proposed", draft, rounds: 3 });
    expect(
      agent.mock.calls.map(([context]) => context.inspectedFiles.length)
    ).toEqual([0, 1, 2]);
    expect(
      agent.mock.calls.map(([context]) => context.remainingInspectionBudget)
    ).toEqual([2, 1, 0]);
    expect(agent.mock.calls[1][0].inspectedFiles).toEqual([
      { path: "src/login.ts", content: "export const login = true;\n" },
    ]);
    expect(git("status", "--porcelain")).toBe("");
  });

  it("uses Step 2.2 initial seeding and does not expose mutation of earlier Context to later calls", async () => {
    const contexts: StaffingContext[] = [];
    const goal = { ...options.goal, objective: "Review src/login.ts" };
    const agent: CEOStaffingAgent = async (context) => {
      contexts.push(context);
      if (contexts.length === 1) {
        expect(context.inspectedFiles).toHaveLength(1);
        context.goal.constraints!.push("Forged constraint");
        context.repository.fileTree.length = 0;
        return inspect("src/other.ts");
      }
      expect(context.goal).toEqual(goal);
      expect(context.repository.fileTree).toHaveLength(2);
      return propose;
    };
    expect((await runStaffingLoop({ ...options, goal, agent })).status).toBe(
      "proposed"
    );
    expect(goal.constraints).toEqual(["No edits"]);
  });

  it("preserves escalation questions and reason as a normal decision", async () => {
    expect(
      await runStaffingLoop({ ...options, agent: agentSequence(escalate) })
    ).toEqual({
      status: "escalated",
      reason: escalate.reason,
      questions: escalate.questions,
      rounds: 1,
    });
  });

  it("does not call the CEO if discovery fails and does not expose raw paths", async () => {
    const agent = agentSequence(propose);
    const result = await runStaffingLoop({
      ...options,
      repositoryPath: join(root, "missing"),
      agent,
    });
    expect(result).toMatchObject({
      status: "failed",
      failure: "discovery",
      rounds: 0,
    });
    expect(JSON.stringify(result)).not.toContain(root);
    expect(agent).not.toHaveBeenCalled();
  });

  it.each([
    0,
    -1,
    1.5,
    NaN,
    Infinity,
    Number.MAX_SAFE_INTEGER + 1,
    "3",
    undefined,
  ])(
    "rejects invalid maxRounds %j without discovery or CEO calls",
    async (maxRounds) => {
      const agent = agentSequence(propose);
      const result = await runStaffingLoop({
        ...options,
        maxRounds: maxRounds as number,
        agent,
      });
      expect(result).toMatchObject({
        status: "failed",
        failure: "invalid-input",
        rounds: 0,
      });
      expect(agent).not.toHaveBeenCalled();
    }
  );

  it.each(["private.txt", "../private.txt", "/outside.ts", "src/missing.ts"])(
    "blocks invalid Inspection %j and stops",
    async (path) => {
      const agent = agentSequence(inspect(path), propose);
      const result = await runStaffingLoop({ ...options, agent });
      expect(result).toMatchObject({
        status: "failed",
        failure: "inspection",
        rounds: 1,
      });
      expect(agent).toHaveBeenCalledTimes(1);
    }
  );

  it("rejects an already-inspected-only request", async () => {
    const agent = agentSequence(
      inspect("src/login.ts"),
      inspect("src/login.ts"),
      propose
    );
    expect(await runStaffingLoop({ ...options, agent })).toMatchObject({
      status: "failed",
      failure: "inspection",
      rounds: 2,
    });
    expect(agent).toHaveBeenCalledTimes(2);
  });

  it("enforces inspection Budget independently of rounds and proposed activity budget", async () => {
    const agent = agentSequence(
      inspect("src/login.ts"),
      inspect("src/other.ts"),
      propose
    );
    expect(
      await runStaffingLoop({
        ...options,
        limits: { ...options.limits, maxTotalFiles: 1 },
        agent,
      })
    ).toMatchObject({ status: "failed", failure: "inspection", rounds: 2 });
  });

  it("does not load files or call again after inspect at the last round", async () => {
    const read = vi.spyOn(gitInfrastructure, "readRepositoryFileAtCommit");
    const agent = agentSequence(inspect("src/login.ts"), propose);
    expect(
      await runStaffingLoop({ ...options, maxRounds: 1, agent })
    ).toMatchObject({ status: "failed", failure: "round-limit", rounds: 1 });
    expect(read).not.toHaveBeenCalled();
    expect(agent).toHaveBeenCalledTimes(1);
  });

  it.each([propose, escalate])(
    "accepts $type on the last round",
    async (last) => {
      const agent = agentSequence(inspect("src/login.ts"), last);
      const result = await runStaffingLoop({ ...options, maxRounds: 2, agent });
      expect(result.status).toBe(
        last.type === "propose" ? "proposed" : "escalated"
      );
      expect(result.rounds).toBe(2);
    }
  );

  it.each([propose, escalate, inspect("src/login.ts")])(
    "detects final Snapshot drift after $type",
    async (decision) => {
      for (const change of ["dirty", "head"]) {
        const agent: CEOStaffingAgent = async () => {
          if (change === "dirty")
            writeFileSync(join(root, "src/other.ts"), "changed\n");
          else git("commit", "--quiet", "--allow-empty", "-m", "HEAD changed");
          return decision;
        };
        expect(await runStaffingLoop({ ...options, agent })).toMatchObject({
          status: "failed",
          failure: "snapshot-drift",
          rounds: 1,
        });
        if (change === "dirty") git("checkout", "--", "src/other.ts");
      }
    }
  );

  it("detects changes during Inspection before another CEO call", async () => {
    const read = gitInfrastructure.readRepositoryFileAtCommit;
    vi.spyOn(
      gitInfrastructure,
      "readRepositoryFileAtCommit"
    ).mockImplementationOnce((...args) => {
      const content = read(...args);
      writeFileSync(join(root, "src/other.ts"), "concurrent change");
      return content;
    });
    const agent = agentSequence(inspect("src/login.ts"), propose);
    expect(await runStaffingLoop({ ...options, agent })).toMatchObject({
      status: "failed",
      failure: "snapshot-drift",
      rounds: 1,
    });
    expect(agent).toHaveBeenCalledTimes(1);
  });

  it("validates even injected Agent output and rejects authority or ID injection", async () => {
    for (const output of [
      { ...propose, id: "forged" },
      { type: "unknown" },
      { type: "propose", draft: { ...draft, approvalRecordId: "forged" } },
    ]) {
      const agent = vi.fn(async () => output) as unknown as CEOStaffingAgent;
      expect(await runStaffingLoop({ ...options, agent })).toMatchObject({
        status: "failed",
        failure: "schema-validation",
        rounds: 1,
      });
    }
  });

  it("does not claim Proposal policy validation or issue authority for structurally valid drafts", async () => {
    const unvalidated = {
      ...draft,
      assignments: [
        {
          ...draft.assignments[0],
          specialistId: "unregistered",
          contextPaths: ["not-approved.ts"],
        },
      ],
    };
    expect(
      await runStaffingLoop({
        ...options,
        agent: agentSequence({ type: "propose", draft: unvalidated }),
      })
    ).toMatchObject({ status: "proposed", draft: unvalidated, rounds: 1 });
  });

  it("counts a failed invocation and omits sensitive arbitrary Agent errors", async () => {
    const agent: CEOStaffingAgent = async () => {
      throw new Error(`secret error at ${root}`);
    };
    const result = await runStaffingLoop({ ...options, agent });
    expect(result).toMatchObject({
      status: "failed",
      failure: "agent-process",
      rounds: 1,
    });
    expect(JSON.stringify(result)).not.toContain(root);
  });

  it.each([
    {
      stdout: "not JSON",
      stderr: "",
      exitCode: 0,
      timedOut: false,
      failure: "malformed-json",
    },
    {
      stdout: "{}",
      stderr: "",
      exitCode: 0,
      timedOut: false,
      failure: "schema-validation",
    },
    {
      stdout: JSON.stringify(propose),
      stderr: "",
      exitCode: 0,
      timedOut: true,
      failure: "timeout",
    },
    {
      stdout: "",
      stderr: "/private/secret config",
      exitCode: 1,
      timedOut: false,
      failure: "agent-process",
    },
  ])(
    "handles default Codex adapter $failure without leaking raw diagnostics",
    async ({ failure, ...result }) => {
      vi.mocked(runCommand).mockResolvedValue(result);
      const output = await runStaffingLoop(options);
      expect(output).toMatchObject({ status: "failed", failure, rounds: 1 });
      expect(JSON.stringify(output)).not.toContain("/private/secret");
    }
  );

  it("uses the real default adapter contract with an injected process runner", async () => {
    vi.mocked(runCommand).mockResolvedValue({
      stdout: JSON.stringify(propose),
      stderr: "",
      exitCode: 0,
      timedOut: false,
    });
    expect(
      await runStaffingLoop({ ...options, timeoutMs: 1234 })
    ).toMatchObject({
      status: "proposed",
      draft,
      rounds: 1,
    });
    expect(vi.mocked(runCommand).mock.calls[0][2].timeoutMs).toBe(1234);
  });
});
