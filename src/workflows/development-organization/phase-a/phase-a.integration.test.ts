import * as governance from "@/application/governance/index.js";
import * as processRuntime from "@/infrastructure/process/index.js";
import {
  runAuthorizedSpecialistDecision,
  runSpecialistDecisions,
} from "./index.js";
import { execFileSync } from "node:child_process";
import {
  mkdtempSync,
  readFileSync,
  realpathSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  configureStaffingSystemPolicy,
  configureHumanDelegation,
  getStaffingSystemPolicy,
  getApprovedStaffingScope,
  type StaffingApprovalResult,
  type StaffingSystemPolicy,
} from "@/application/governance/index.js";
import { confirmHumanAction } from "@/infrastructure/terminal/index.js";
import { withGovernanceRecords } from "@/services/governance-records/index.js";
import type {
  StaffingDraft,
  CEOStaffingAgent,
} from "@/application/staffing/index.js";
import {
  runStaffingApproval,
  type StaffingApprovalWorkflowOptions,
} from "./staffing-approval/staffing-approval.js";

// Real receipts, signed storage and Git; only controlling-terminal I/O is fake.
const terminal = vi.hoisted(() => ({ home: "", line: "", offset: 0 }));
vi.mock("node:os", async (original) => ({
  ...(await original<typeof import("node:os")>()),
  homedir: () => terminal.home,
}));
vi.mock("node:tty", () => ({ isatty: (fd: number) => fd === 999 }));
vi.mock("node:fs", async (original) => {
  const actual = await original<typeof import("node:fs")>();
  return {
    ...actual,
    openSync: (...args: Parameters<typeof actual.openSync>) =>
      args[0] === "/dev/tty" ? 999 : actual.openSync(...args),
    closeSync: (fd: number) => {
      if (fd !== 999) actual.closeSync(fd);
    },
    writeSync: (fd: number, text: string) => {
      if (fd !== 999) throw new Error("Unexpected terminal descriptor");
      const token = /Type Approve ([a-f0-9-]+)/.exec(text)![1];
      terminal.line = `Approve ${token}\n`;
      terminal.offset = 0;
      return text.length;
    },
    readSync: (
      fd: number,
      buffer: Buffer,
      offset: number,
      length: number,
      position: number | null
    ) => {
      if (fd !== 999)
        return actual.readSync(fd, buffer, offset, length, position);
      if (terminal.offset >= terminal.line.length) return 0;
      buffer[0] = terminal.line.charCodeAt(terminal.offset++);
      return 1;
    },
  };
});
let root: string;
let home: string;
let system: StaffingSystemPolicy;
let options: StaffingApprovalWorkflowOptions;
let draft: StaffingDraft;
const git = (...args: string[]) =>
  execFileSync("git", args, {
    cwd: root,
    encoding: "utf8",
    stdio: "pipe",
  }).trim();
function accept(request: StaffingApprovalResult) {
  if (request.status !== "approval-required")
    throw new Error(JSON.stringify(request));
  const receipt = confirmHumanAction(request.binding, "Test review");
  if (!receipt) throw new Error("Expected controlling terminal receipt");
  return receipt;
}
function configure() {
  return configureStaffingSystemPolicy(
    system,
    accept(configureStaffingSystemPolicy(system))
  );
}
function delegate(maxAgentInvocations = 2) {
  const policy = {
    allowedSpecialistIds: ["frontend"],
    delegatedContextScopes: [{ kind: "file" as const, path: "a.ts" }],
    maxAgentInvocations,
    expiresAt: new Date(Date.now() + 86400000).toISOString(),
  };
  expect(
    configureHumanDelegation(
      root,
      policy,
      accept(configureHumanDelegation(root, policy))
    ).status
  ).toBe("configured");
}
function issuanceCount() {
  return withGovernanceRecords(
    (raw) =>
      Object.values(
        (raw as { repositories: Record<string, { issuances: unknown[] }> })
          .repositories
      )[0].issuances.length
  );
}
beforeEach(() => {
  home = mkdtempSync(join(tmpdir(), "workflow-home-"));
  terminal.home = home;
  root = realpathSync(
    mkdtempSync(join(tmpdir(), "staffing-approval-workflow-"))
  );
  git("init", "--quiet");
  git("config", "user.name", "Test");
  git("config", "user.email", "test@example.com");
  writeFileSync(join(root, "a.ts"), "export const a = 1;\n");
  git("add", ".");
  git("commit", "--quiet", "-m", "initial");
  system = {
    repositoryRoot: root,
    phase: "phase-a",
    availableSpecialists: [
      {
        id: "frontend",
        role: "Frontend",
        objective: "Analyze",
        authority: { repositoryAccess: "read", shellExecution: false },
      },
    ],
    contextAccessPolicy: { allowedScopes: [{ kind: "file", path: "a.ts" }] },
    limits: {
      maxFilesPerRequest: 2,
      maxTotalFiles: 3,
      maxFileBytes: 4096,
      maxContextBytes: 20000,
      maxFileTreeEntries: 10,
    },
    maxAgentInvocations: 2,
  };
  draft = {
    intent: {
      problem: "UI",
      desiredOutcome: "Analysis",
      considerations: [],
      uncertainties: [],
    },
    assignments: [
      {
        specialistId: "frontend",
        objective: "Analyze UI",
        contextPaths: ["a.ts"],
        rationale: "Frontend knowledge",
      },
    ],
    budget: { maxAgentInvocations: 2 },
    rationale: "Review",
  };
  options = {
    repositoryPath: root,
    goal: {
      objective: "Review UI",
      targetRepository: "repo",
      constraints: ["Preserve behavior", "No edits"],
    },
    maxRounds: 3,
    agent: vi.fn(async () => ({ type: "propose" as const, draft })),
  };
});
afterEach(() => {
  vi.restoreAllMocks();
  rmSync(root, { recursive: true, force: true });
  rmSync(home, { recursive: true, force: true });
});

describe("Real Staffing and Governance composition", () => {
  it("blocks an absent policy before any CEO invocation", async () => {
    expect(await runStaffingApproval(options)).toMatchObject({
      status: "failed",
      failure: "system-policy",
      rounds: 0,
    });
    expect(options.agent).not.toHaveBeenCalled();
  });
  it("queries a detached Human-approved policy for the canonical Repository", () => {
    expect(configure()).toEqual({ status: "configured", version: 1 });
    const result = getStaffingSystemPolicy(join(root, "."));
    expect(result).toEqual({
      status: "ready",
      configuration: system,
      version: 1,
    });
    if (result.status !== "ready") throw new Error("Missing policy");
    result.configuration.availableSpecialists.length = 0;
    expect(getStaffingSystemPolicy(root)).toEqual({
      status: "ready",
      configuration: system,
      version: 1,
    });
  });
  it.each([
    "exact",
    "mixed-empty",
    "nested",
    "repository",
    "future-confirmation",
    "schema",
    "signature",
  ])("blocks %s records before the CEO", async (kind) => {
    configure();
    if (kind === "signature") {
      const path = join(home, ".ai-workspace-governance", "records.json");
      const envelope = JSON.parse(readFileSync(path, "utf8")) as {
        payload: string;
        signature: string;
      };
      envelope.payload = envelope.payload.replace(
        '"maxAgentInvocations":2',
        '"maxAgentInvocations":99'
      );
      writeFileSync(path, JSON.stringify(envelope));
    } else {
      withGovernanceRecords((raw, save) => {
        const ledger = raw as {
          repositories: Record<
            string,
            {
              systems: Array<{
                configuration: Record<string, unknown>;
                approval: { confirmedAt: string };
              }>;
            }
          >;
        };
        const record = Object.values(ledger.repositories)[0].systems[0];
        if (kind === "exact" || kind === "mixed-empty")
          record.configuration.allowedContextPaths =
            kind === "exact" ? ["a.ts"] : [];
        if (kind === "exact") delete record.configuration.contextAccessPolicy;
        if (kind === "nested") {
          record.configuration.policy = {
            maxAgentInvocations: 2,
            enforcementRules: [],
          };
          delete record.configuration.maxAgentInvocations;
        }
        if (kind === "repository") record.configuration.repositoryRoot = home;
        if (kind === "future-confirmation")
          record.approval.confirmedAt = new Date(
            Date.now() + 86400000
          ).toISOString();
        if (kind === "schema") record.configuration.phase = "phase-b";
        save(ledger);
      });
    }
    expect(getStaffingSystemPolicy(root).status).toBe("denied");
    expect(await runStaffingApproval(options)).toMatchObject({
      status: "failed",
      failure: "system-policy",
    });
    expect(options.agent).not.toHaveBeenCalled();
  });
  it("executes one Staffing run and issues a delegated Scope without Human input", async () => {
    configure();
    delegate();
    options.confirmApproval = vi.fn();
    const result = await runStaffingApproval(options);
    expect(result.status).toBe("approved");
    if (result.status !== "approved") throw new Error(JSON.stringify(result));
    expect(result.approval.source.type).toBe("human-delegation");
    expect(result.scope.goal).toEqual(options.goal);
    expect(getApprovedStaffingScope(result.scope.id).status).toBe("approved");
    expect(options.agent).toHaveBeenCalledTimes(1);
    expect(options.confirmApproval).not.toHaveBeenCalled();
    expect(issuanceCount()).toBe(1);
  });
  it("inspects Context before finalizing and approving without restarting the run", async () => {
    configure();
    delegate();
    options.agent = vi
      .fn<CEOStaffingAgent>()
      .mockResolvedValueOnce({
        type: "inspect",
        paths: ["a.ts"],
        reason: "Need evidence",
      })
      .mockImplementationOnce(async (context) => {
        expect(context.inspectedFiles).toEqual([
          { path: "a.ts", content: "export const a = 1;\n" },
        ]);
        return { type: "propose", draft };
      });
    expect((await runStaffingApproval(options)).status).toBe("approved");
    expect(options.agent).toHaveBeenCalledTimes(2);
    expect(issuanceCount()).toBe(1);
  });
  it.each(["none", "outside"])(
    "uses direct confirmation with %s delegation coverage, without holding a lock or rerunning Staffing",
    async (coverage) => {
      configure();
      if (coverage === "outside") delegate(1);
      let reviewedId: string | undefined;
      options.confirmApproval = vi.fn((request) => {
        // A second Ledger operation proves no lock is held while Human responds.
        expect(getStaffingSystemPolicy(root).status).toBe("ready");
        if (request.subject && "id" in request.subject)
          reviewedId = request.subject.id;
        return accept(request);
      });
      const result = await runStaffingApproval(options);
      expect(result.status).toBe("approved");
      if (result.status !== "approved") throw new Error(JSON.stringify(result));
      expect(result.approval.source.type).toBe("direct-human");
      expect(result.scope.proposalId).toBe(reviewedId);
      expect(options.agent).toHaveBeenCalledTimes(1);
      expect(options.confirmApproval).toHaveBeenCalledTimes(1);
    }
  );
  it.each(["reject", "forged"])(
    "does not issue Scope on %s confirmation",
    async (kind) => {
      configure();
      options.confirmApproval = () =>
        kind === "reject" ? null : { token: "forged" };
      expect((await runStaffingApproval(options)).status).toBe(
        kind === "reject" ? "rejected" : "denied"
      );
      expect(issuanceCount()).toBe(0);
    }
  );
  it("denies invalid Delegation instead of asking for direct approval", async () => {
    configure();
    delegate();
    expect(
      configureHumanDelegation(
        root,
        null,
        accept(configureHumanDelegation(root, null))
      ).status
    ).toBe("configured");
    options.confirmApproval = vi.fn();
    expect((await runStaffingApproval(options)).status).toBe("denied");
    expect(options.confirmApproval).not.toHaveBeenCalled();
    expect(issuanceCount()).toBe(0);
  });
  it.each(["dirty", "head", "policy", "compatible-policy"])(
    "rechecks %s changes during Human confirmation",
    async (change) => {
      configure();
      options.confirmApproval = (request) => {
        const receipt = accept(request);
        if (change === "policy" || change === "compatible-policy") {
          if (change === "policy") system.maxAgentInvocations = 1;
          configure();
        } else {
          writeFileSync(join(root, "a.ts"), "changed\n");
          if (change === "head") {
            git("add", ".");
            git("commit", "--quiet", "-m", "drift");
          }
        }
        return receipt;
      };
      expect((await runStaffingApproval(options)).status).toBe("denied");
      expect(options.agent).toHaveBeenCalledTimes(1);
      expect(issuanceCount()).toBe(0);
    }
  );
  it("uses current Approval policy without requiring the Staffing-start version to match", async () => {
    configure();
    options.agent = vi.fn(async () => {
      expect(configure()).toEqual({ status: "configured", version: 2 });
      return { type: "propose" as const, draft };
    });
    options.confirmApproval = (request) => accept(request);
    const result = await runStaffingApproval(options);
    expect(result.status).toBe("approved");
    if (result.status === "approved")
      expect(result.approval.systemPolicyVersion).toBe(2);
  });
  it("rejects a newly incompatible System Policy at Approval", async () => {
    configure();
    options.agent = vi.fn(async () => {
      system.maxAgentInvocations = 1;
      configure();
      return { type: "propose" as const, draft };
    });
    options.confirmApproval = vi.fn();
    expect((await runStaffingApproval(options)).status).toBe("denied");
    expect(options.confirmApproval).not.toHaveBeenCalled();
    expect(issuanceCount()).toBe(0);
  });
});

describe("Reserved Invocation → existing v2 Decision integration", () => {
  async function reserve() {
    configure();
    delegate();
    const approval = await runStaffingApproval(options);
    if (approval.status !== "approved")
      throw new Error(JSON.stringify(approval));
    const authorized = governance.authorizeSpecialistInvocation({
      scopeId: approval.scope.id,
      scopeVersion: approval.scope.version,
      assignmentId: approval.scope.assignments[0].assignmentId,
      requestedContextPaths: ["a.ts"],
    });
    if (authorized.status !== "allowed")
      throw new Error(JSON.stringify(authorized));
    return authorized.invocation;
  }
  function ledger() {
    return withGovernanceRecords(
      (raw) =>
        raw as {
          repositories: Record<
            string,
            { reservations?: governance.InvocationReservation[] }
          >;
        }
    );
  }
  const payload = {
    recommendation: "Preserve UI behavior",
    evidence: [
      { path: "a.ts", lineStart: 1, description: "Current implementation" },
    ],
    risks: [],
    uncertainty: [],
  };
  function codex() {
    return vi.spyOn(processRuntime, "runCommand").mockResolvedValue({
      stdout: JSON.stringify(payload),
      stderr: "",
      exitCode: 0,
      timedOut: false,
    });
  }
  it("executes the approved Specialist with its Assignment, outside the Ledger lock, and blocks reuse", async () => {
    const invocation = await reserve();
    const before = ledger();
    const authorize = vi.spyOn(governance, "authorizeSpecialistInvocation");
    const command = codex().mockImplementation(async (name, args, runtime) => {
      expect(name).toBe("codex");
      expect(runtime.cwd).not.toBe(root);
      // The real signed read acquires the same Lock: execution holds no Ledger lock.
      expect(
        Object.values(ledger().repositories)[0].reservations![0].claimedAt
      ).toEqual(expect.any(String));
      const prompt = args.at(-1)!;
      expect(JSON.parse(prompt.split("SpecialistContext:\n")[1])).toEqual({
        goal: invocation.goal,
        assignmentObjective: invocation.assignmentObjective,
        repositoryCommitSha: invocation.snapshot.commitSha,
        files: invocation.files,
      });
      expect(prompt).toContain(
        JSON.stringify({
          role: invocation.specialist.role,
          objective: invocation.specialist.objective,
        })
      );
      return {
        stdout: JSON.stringify(payload),
        stderr: "",
        exitCode: 0,
        timedOut: false,
      };
    });
    expect(await runAuthorizedSpecialistDecision(invocation)).toEqual({
      specialistId: invocation.specialist.id,
      ...payload,
    });
    const after = ledger();
    const reservations = Object.values(after.repositories)[0].reservations!;
    expect(reservations).toHaveLength(1);
    expect(reservations[0].claimedAt).toEqual(expect.any(String));
    delete reservations[0].claimedAt;
    expect(after).toEqual(before);
    await expect(runAuthorizedSpecialistDecision(invocation)).rejects.toThrow(
      "Invocation claim denied"
    );
    expect(command).toHaveBeenCalledTimes(1);
    expect(authorize).not.toHaveBeenCalled();
  });
  it("never starts Codex after Claim rejection", async () => {
    const invocation = await reserve();
    invocation.assignmentObjective = "Tampered task";
    const command = codex();
    await expect(runAuthorizedSpecialistDecision(invocation)).rejects.toThrow(
      "Invocation claim denied"
    );
    expect(command).not.toHaveBeenCalled();
  });
  it.each([
    "snapshot-before",
    "snapshot-after",
    "evidence",
    "codex",
    "timeout",
    "protocol",
  ])("propagates %s failure and retains the single-use Claim", async (kind) => {
    const invocation = await reserve();
    const command = codex();
    if (kind === "snapshot-before") {
      const claim = governance.claimAuthorizedInvocation;
      vi.spyOn(governance, "claimAuthorizedInvocation").mockImplementationOnce(
        (input) => {
          const result = claim(input);
          expect(result.status).toBe("claimed");
          writeFileSync(join(root, "a.ts"), "drift after Claim");
          return result;
        }
      );
    }
    if (kind === "snapshot-after")
      command.mockImplementationOnce(async () => {
        writeFileSync(join(root, "a.ts"), "drift during Codex");
        return {
          stdout: JSON.stringify(payload),
          stderr: "",
          exitCode: 0,
          timedOut: false,
        };
      });
    if (kind === "evidence")
      command.mockResolvedValueOnce({
        stdout: JSON.stringify({
          ...payload,
          evidence: [{ path: "not-supplied.ts", description: "Invalid" }],
        }),
        stderr: "",
        exitCode: 0,
        timedOut: false,
      });
    if (kind === "codex")
      command.mockResolvedValueOnce({
        stdout: "",
        stderr: "Codex unavailable",
        exitCode: 1,
        timedOut: false,
      });
    if (kind === "timeout")
      command.mockResolvedValueOnce({
        stdout: "",
        stderr: "",
        exitCode: null,
        timedOut: true,
      });
    if (kind === "protocol")
      command.mockResolvedValueOnce({
        stdout: "not JSON",
        stderr: "",
        exitCode: 0,
        timedOut: false,
      });
    const expected = kind.startsWith("snapshot")
      ? /working tree/
      : kind === "evidence"
        ? /Evidence/
        : kind === "codex"
          ? /Codex unavailable/
          : kind === "timeout"
            ? /timed out/
            : /malformed JSON/;
    await expect(runAuthorizedSpecialistDecision(invocation)).rejects.toThrow(
      expected
    );
    const reservations = Object.values(ledger().repositories)[0].reservations!;
    expect(reservations).toHaveLength(1);
    expect(reservations[0].claimedAt).toEqual(expect.any(String));
    await expect(runAuthorizedSpecialistDecision(invocation)).rejects.toThrow(
      "Invocation claim denied"
    );
    expect(command).toHaveBeenCalledTimes(kind === "snapshot-before" ? 0 : 1);
  });
});

describe("Approved dynamic Specialists → v2 Decisions → v3 Comparison", () => {
  async function batch(budget = 2) {
    writeFileSync(join(root, "b.ts"), "export const b = 2;\n");
    git("add", ".");
    git("commit", "--quiet", "-m", "second Context");
    system.availableSpecialists.push({
      ...system.availableSpecialists[0],
      id: "ux",
      role: "UX",
      objective: "Review interactions",
    });
    system.contextAccessPolicy.allowedScopes.push({
      kind: "file",
      path: "b.ts",
    });
    draft.assignments.push({
      specialistId: "ux",
      objective: "Assess interaction risks",
      contextPaths: ["b.ts"],
      rationale: "UX knowledge",
    });
    draft.budget.maxAgentInvocations = budget;
    configure();
    options.confirmApproval = (request) => accept(request);
    const approval = await runStaffingApproval(options);
    if (approval.status !== "approved")
      throw new Error(JSON.stringify(approval));
    return {
      scope: approval.scope,
      input: {
        scopeId: approval.scope.id,
        requests: approval.scope.assignments.map((assignment) => ({
          scopeId: approval.scope.id,
          scopeVersion: approval.scope.version,
          assignmentId: assignment.assignmentId,
          requestedContextPaths: assignment.contextPaths,
        })),
      },
    };
  }
  function reservations() {
    return withGovernanceRecords(
      (raw) =>
        Object.values(
          (
            raw as {
              repositories: Record<
                string,
                { reservations?: governance.InvocationReservation[] }
              >;
            }
          ).repositories
        )[0].reservations ?? []
    );
  }
  function runtime(mode: "success" | "decision" | "comparison" = "success") {
    return vi
      .spyOn(processRuntime, "runCommand")
      .mockImplementation(async (_name, args) => {
        const prompt = args.at(-1)!;
        if (prompt.includes("ComparisonContext:\n")) {
          const context = JSON.parse(prompt.split("ComparisonContext:\n")[1]);
          const specialistIds = context.decisions.map(
            (decision: { specialistId: string }) => decision.specialistId
          );
          return {
            stdout: JSON.stringify({
              findings: [],
              gaps: [
                {
                  concern: "Coverage",
                  kind: "uncertainty",
                  specialistIds:
                    mode === "comparison" ? ["unknown"] : specialistIds,
                  reason: "More evidence needed",
                },
              ],
            }),
            stderr: "",
            exitCode: 0,
            timedOut: false,
          };
        }
        const context = JSON.parse(prompt.split("SpecialistContext:\n")[1]);
        return {
          stdout: JSON.stringify({
            recommendation: context.assignmentObjective,
            evidence: [
              {
                path:
                  mode === "decision" ? "missing.ts" : context.files[0].path,
                lineStart: 1,
                description: "Provided implementation",
              },
            ],
            risks: [],
            uncertainty: [],
          }),
          stderr: "",
          exitCode: 0,
          timedOut: false,
        };
      });
  }
  it("runs approved dynamic Assignments in order and passes original Goal/SHA/Decisions to v3", async () => {
    const { scope, input } = await batch();
    const command = runtime();
    const result = await runSpecialistDecisions(input);
    expect(result.status).toBe("completed");
    if (result.status !== "completed") throw new Error(JSON.stringify(result));
    expect(
      result.decisions.map(({ specialistId, recommendation, evidence }) => ({
        specialistId,
        recommendation,
        path: evidence[0].path,
      }))
    ).toEqual(
      scope.assignments.map(({ specialistId, objective, contextPaths }) => ({
        specialistId,
        recommendation: objective,
        path: contextPaths[0],
      }))
    );
    expect(command).toHaveBeenCalledTimes(3);
    for (const [index, [, args]] of command.mock.calls.slice(0, 2).entries()) {
      const context = JSON.parse(args.at(-1)!.split("SpecialistContext:\n")[1]);
      expect(context.goal).toEqual(scope.goal);
      expect(context.repositoryCommitSha).toBe(scope.snapshot.commitSha);
      expect(context.assignmentObjective).toBe(
        scope.assignments[index].objective
      );
    }
    const comparisonContext = JSON.parse(
      command.mock.calls[2][1].at(-1)!.split("ComparisonContext:\n")[1]
    );
    expect(comparisonContext).toEqual({
      goal: scope.goal,
      repositoryCommitSha: scope.snapshot.commitSha,
      decisions: result.decisions,
    });
    expect(result.comparison?.gaps[0].specialistIds).toEqual([
      "frontend",
      "ux",
    ]);
    expect(reservations()).toHaveLength(2);
    expect(
      reservations().every(({ claimedAt }) => claimedAt !== undefined)
    ).toBe(true);
  });
  it("does not reserve anything if a later request fails preflight", async () => {
    const { input } = await batch();
    input.requests[1] = structuredClone(input.requests[0]);
    const command = runtime();
    expect(await runSpecialistDecisions(input)).toMatchObject({
      status: "failed",
      stage: "preflight",
      assignmentId: input.requests[0].assignmentId,
    });
    expect(reservations()).toHaveLength(0);
    expect(command).not.toHaveBeenCalled();
  });
  it("leaves individual Context authorization to Governance", async () => {
    const { input } = await batch();
    input.requests[0].requestedContextPaths = ["unapproved.ts"];
    const command = runtime();
    expect(await runSpecialistDecisions(input)).toMatchObject({
      status: "failed",
      stage: "authorization",
      assignmentId: input.requests[0].assignmentId,
    });
    expect(reservations()).toHaveLength(0);
    expect(command).not.toHaveBeenCalled();
  });
  it("stops after budget denial without executing or comparing remaining work", async () => {
    const { input } = await batch(1);
    const command = runtime();
    expect(await runSpecialistDecisions(input)).toMatchObject({
      status: "failed",
      stage: "authorization",
      assignmentId: input.requests[1].assignmentId,
    });
    expect(reservations()).toHaveLength(1);
    expect(command).toHaveBeenCalledTimes(1);
  });
  it("reports an opaque Claim denial without executing Codex or reserving the next Assignment", async () => {
    const { input } = await batch();
    vi.spyOn(governance, "claimAuthorizedInvocation").mockReturnValueOnce({
      status: "denied",
      reason: "Invocation claim denied",
    });
    const command = runtime();
    expect(await runSpecialistDecisions(input)).toEqual({
      status: "failed",
      stage: "claim",
      reason: "Invocation claim denied",
      assignmentId: input.requests[0].assignmentId,
    });
    expect(reservations()).toHaveLength(1);
    expect(reservations()[0]).not.toHaveProperty("claimedAt");
    expect(command).not.toHaveBeenCalled();
  });
  it("retains the Claim and stops remaining work on v2 Evidence failure", async () => {
    const { input } = await batch();
    const command = runtime("decision");
    expect(await runSpecialistDecisions(input)).toMatchObject({
      status: "failed",
      stage: "decision",
      assignmentId: input.requests[0].assignmentId,
    });
    expect(reservations()).toHaveLength(1);
    expect(reservations()[0].claimedAt).toEqual(expect.any(String));
    expect(command).toHaveBeenCalledTimes(1);
  });
  it("reports v3 Reference Validation failure separately after all Decisions succeed", async () => {
    const { input } = await batch();
    const command = runtime("comparison");
    const result = await runSpecialistDecisions(input);
    expect(result).toMatchObject({ status: "failed", stage: "comparison" });
    expect(result).not.toHaveProperty("decisions");
    expect(command).toHaveBeenCalledTimes(3);
    expect(reservations()).toHaveLength(2);
    expect(
      reservations().every(({ claimedAt }) => claimedAt !== undefined)
    ).toBe(true);
  });
});
