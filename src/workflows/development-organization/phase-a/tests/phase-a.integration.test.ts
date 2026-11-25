import { prepareAssignmentContext } from "@/application/governance/records/assignment-plans/prepare-assignment-context.js";
import { withGovernanceLedger } from "@/application/governance/records/governance-transaction.js";
import { executeReadOnlyWorkItem } from "@/application/execution/index.js";
import * as governanceRecords from "@/services/governance-records/index.js";
import * as filesystem from "node:fs";
import { Command } from "@langchain/langgraph";
import * as staffingApplication from "@/application/staffing/index.js";
import * as phaseAGraph from "../graph.js";
import {
  createPhaseBGraph,
  type PhaseBGraphOptions,
} from "../../phase-b/index.js";
import { runWorkDecomposition } from "@/application/work-decomposition/index.js";
import { beginWorkItemExecutionSource } from "@/application/governance/authorization/features/work-item-execution/flow/register-work-item-execution-source.js";
import { runStaffingCli } from "@/cli/commands/staffing/staffing.js";
import { registerWorkDecomposition } from "@/application/governance/records/work-decomposition-records.js";
import * as governance from "@/application/governance/index.js";
import * as processRuntime from "@/infrastructure/process/index.js";
import {
  createPhaseAGraph as createGraph,
  runAuthorizedSpecialistDecision,
} from "../index.js";
import { execFileSync } from "node:child_process";
import {
  mkdtempSync,
  mkdirSync,
  readFileSync,
  realpathSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { dirname, join } from "node:path";
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
import {
  withGovernanceRecords,
  governanceDigest,
} from "@/services/governance-records/index.js";
import type {
  StaffingDraft,
  CEOStaffingAgent,
} from "@/application/staffing/index.js";
import {
  runStaffingApproval,
  type StaffingApprovalWorkflowOptions,
} from "../entrypoints/run-staffing-approval.js";

function createPhaseAGraph(options: Parameters<typeof createGraph>[0] = {}) {
  return createGraph({
    assessmentAgent: async ({ decisions }) => ({
      status: "sufficient",
      reason: "Verified analysis supports this direction.",
      sources: [
        { kind: "recommendation", specialistId: decisions[0].specialistId },
      ],
    }),
    ...options,
  });
}

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
    writeSync: (
      fd: number,
      text: string | Buffer,
      offset?: number,
      length?: number,
      position?: number
    ) => {
      if (fd !== 999 && Buffer.isBuffer(text))
        return actual.writeSync(fd, text, offset, length, position);
      if (fd !== 999 || typeof text !== "string")
        throw new Error("Unexpected terminal descriptor");
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
function delegate(
  maxAgentInvocations = 2,
  allowedSpecialistIds = ["frontend"],
  delegatedContextScopes: StaffingSystemPolicy["contextAccessPolicy"]["allowedScopes"] = [
    { kind: "file", path: "a.ts" },
  ],
  maxTotalAnalysisInvocations?: number
) {
  const policy = {
    allowedSpecialistIds,
    delegatedContextScopes,
    maxAgentInvocations,
    ...(maxTotalAnalysisInvocations !== undefined && {
      maxTotalAnalysisInvocations,
    }),
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
  function prepareBatch(budget = 2, totalDelegated?: number) {
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
    delegate(
      budget,
      ["frontend", "ux"],
      system.contextAccessPolicy.allowedScopes,
      totalDelegated
    );
  }
  it.each(["total", "rounds"] as const)(
    "enforces the separate Analysis Budget and blocks the next round at the %s limit",
    async (limit) => {
      const total = limit === "total" ? 5 : 6;
      const rounds = limit === "rounds" ? 3 : 4;
      system.analysis = {
        maxTotalAnalysisInvocations: total,
        maxRefinementRounds: rounds,
      };
      draft.budget.maxTotalAnalysisInvocations = total;
      prepareBatch(2, total);
      runtime();
      let assessmentCalls = 0;
      const graph = createPhaseAGraph({
        ...options,
        executionTarget: "ceo-synthesis",
        assessmentAgent: async ({ limits }) => {
          if (assessmentCalls === 0) {
            const initial = withGovernanceRecords((raw) => {
              const ledger =
                raw as import("@/application/governance/model/ledger.js").GovernanceLedger;
              return Object.values(ledger.repositories)[0].issuances[0].scope;
            });
            expect(limits.remainingInvocations).toBe(total - 2);
            expect(limits.remainingRefinements).toBe(rounds);
            const assignment = initial.assignments[0];
            // Both initial calls are reserved. Extra total budget does not expand the initial Scope.
            expect(
              governance.authorizeSpecialistInvocation({
                scopeId: initial.id,
                scopeVersion: initial.version,
                assignmentId: assignment.assignmentId,
                requestedContextPaths: assignment.contextPaths,
              }).status
            ).toBe("denied");
          }
          return {
            status: "refinement-required",
            reason: "Investigate remaining evidence",
            sources: [{ kind: "recommendation", specialistId: "frontend" }],
            changes: [
              {
                kind: "re-evaluation",
                specialistId: "frontend",
                objective: `Refine ${++assessmentCalls}`,
                reason: "Clarify evidence",
              },
            ],
          };
        },
      });
      const state = await graph.invoke({
        goal: options.goal,
        repositoryPath: root,
      });
      expect(assessmentCalls).toBe(4);
      expect(state.approvalResult).toMatchObject({
        status: "approved",
        scope: {
          budget: {
            maxAgentInvocations: 2,
            maxTotalAnalysisInvocations: total,
          },
          analysis: { maxRefinementRounds: rounds },
        },
      });
      expect(state.analysisRefinement?.status).toBe("denied");
      expect(reservations()).toHaveLength(5);
      expect(reservations().every(({ claimedAt }) => claimedAt)).toBe(true);
      expect(issuanceCount()).toBe(4);
      const scope =
        state.approvalResult?.status === "approved"
          ? state.approvalResult.scope
          : undefined;
      system.analysis = {
        maxTotalAnalysisInvocations: 9,
        maxRefinementRounds: 9,
      };
      configure();
      expect(governance.getApprovedStaffingScope(scope!.id).status).toBe(
        "denied"
      );
      expect(scope?.budget.maxTotalAnalysisInvocations).toBe(total);
      expect(scope?.analysis?.maxRefinementRounds).toBe(rounds);
    }
  );

  it.each(["delegated", "direct", "policy"] as const)(
    "applies %s approval to an explicit total Analysis Budget",
    async (mode) => {
      system.analysis = {
        maxTotalAnalysisInvocations: mode === "policy" ? 4 : 5,
        maxRefinementRounds: 3,
      };
      configure();
      delegate(
        2,
        ["frontend"],
        system.contextAccessPolicy.allowedScopes,
        mode === "delegated" ? 5 : 3
      );
      draft.budget.maxTotalAnalysisInvocations = 5;
      const result = await runStaffingApproval(options);
      if (mode === "policy") {
        expect(result).toMatchObject({
          status: "failed",
          failure: "policy-validation",
        });
        expect(issuanceCount()).toBe(0);
        return;
      }
      if (mode === "direct" && result.status !== "approval-required")
        throw new Error(JSON.stringify(result));
      const approved =
        result.status === "approval-required"
          ? governance.approveStaffingProposal(
              result.request.subject,
              accept(result.request)
            )
          : result;
      expect(approved).toMatchObject({
        status: "approved",
        approval: {
          source: {
            type: mode === "direct" ? "direct-human" : "human-delegation",
          },
        },
        scope: {
          budget: { maxAgentInvocations: 2, maxTotalAnalysisInvocations: 5 },
          analysis: { maxRefinementRounds: 3 },
        },
      });
    }
  );
  it("keeps duplicate Specialist policy in Staffing and Governance, not batch preparation", async () => {
    prepareBatch();
    const result = await staffingApplication.runStaffing({
      goal: options.goal,
      agent: options.agent,
      maxRounds: options.maxRounds,
      systemPolicy: system,
    });
    if (result.status !== "proposed") throw new Error("Missing Proposal");
    const proposal = structuredClone(result.proposal);
    proposal.assignments[1].specialistId = proposal.assignments[0].specialistId;
    expect(() =>
      staffingApplication.validateStaffingProposal(proposal, system)
    ).toThrow("Duplicate Specialist");
    expect(governance.approveStaffingProposal(proposal)).toMatchObject({
      status: "denied",
    });
    expect(reservations()).toHaveLength(0);
  });
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
  function runtime(
    mode: "success" | "decision" | "comparison" = "success",
    synthesisDirection?: string
  ) {
    const runRealCommand = processRuntime.runCommand;
    return vi
      .spyOn(processRuntime, "runCommand")
      .mockImplementation(async (name, args, options) => {
        if (name === "git") return runRealCommand(name, args, options);
        const prompt = args.at(-1)!;
        if (prompt.includes("SynthesisContext:\n")) {
          const context = JSON.parse(prompt.split("SynthesisContext:\n")[1]);
          const sources = [
            ...context.decisions.map((d: { specialistId: string }) => ({
              kind: "recommendation",
              specialistId: d.specialistId,
            })),
            ...(context.comparison.status === "completed"
              ? context.comparison.comparison.gaps.map(
                  (_: unknown, index: number) => ({ kind: "gap", index })
                )
              : []),
          ];
          const statement = {
            text: context.revision
              ? "Revised reversible direction addressing Human feedback"
              : (synthesisDirection ??
                "Propose reversible direction while retaining unresolved coverage"),
            sources,
          };
          return {
            stdout: JSON.stringify({
              type: "propose",
              proposal: {
                direction: statement,
                rationale: [statement],
                alternatives: [],
                tradeoffs: [],
                risks: [],
                unresolvedIssues: [statement],
                humanReviewItems: [statement],
              },
            }),
            stderr: "",
            exitCode: 0,
            timedOut: false,
          };
        }
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

  async function pendingDirection(
    count = 2,
    confirmDirection?: import("../graph.js").PhaseAGraphOptions["confirmDirection"],
    executionDelegationProposalAgent?: governance.ExecutionDelegationProposalAgent,
    normalWorkflow = false,
    typoTarget?: string
  ) {
    if (count === 2) prepareBatch();
    else {
      configure();
      delegate();
    }
    const command = runtime(
      "success",
      typoTarget && `Fix typos in ${typoTarget}`
    );
    const graph = createPhaseAGraph({
      ...options,
      executionTarget: normalWorkflow
        ? "human-direction-governance"
        : "independent-direction-review",
      confirmDirection,
      executionDelegationProposalAgent,
    });
    const config = { configurable: { thread_id: "direction-test" } };
    const pending = await graph.invoke(
      {
        goal: typoTarget
          ? {
              ...options.goal,
              objective: `Fix typos in ${typoTarget}`,
              constraints: [],
            }
          : options.goal,
        repositoryPath: root,
      },
      config
    );
    if (!normalWorkflow) expect(pending.directionReview).toBeDefined();
    expect(
      (await graph.getState(config)).tasks.some(
        (task) => task.interrupts.length === 1
      )
    ).toBe(Boolean(pending.directionReview));
    return { graph, config, pending, command };
  }

  it.each(["round-limit", "policy", "invalid-source", "blocked"] as const)(
    "terminates Analysis Assessment on %s without promoting unsupported results",
    async (mode) => {
      system.maxAgentInvocations = 4;
      draft.budget.maxAgentInvocations = 4;
      configure();
      delegate(4);
      const command = runtime();
      let round = 0;
      const graph = createPhaseAGraph({
        ...options,
        executionTarget: "ceo-synthesis",
        assessmentAgent: async () => ({
          status: mode === "blocked" ? "blocked" : "refinement-required",
          reason: "More evidence",
          sources: [
            {
              kind: "recommendation",
              specialistId: mode === "invalid-source" ? "unknown" : "frontend",
            },
          ],
          ...(mode === "blocked"
            ? {}
            : {
                changes: [
                  mode === "policy"
                    ? {
                        kind: "context-extension",
                        specialistId: "frontend",
                        context: [{ kind: "directory", path: "forbidden" }],
                        reason: "Context gap",
                      }
                    : {
                        kind: "re-evaluation",
                        specialistId: "frontend",
                        objective: `Review aspect ${++round}`,
                        reason: "Context gap",
                      },
                ],
              }),
        }),
      });
      const state = await graph.invoke({
        goal: options.goal,
        repositoryPath: root,
      });
      expect(state.synthesisResult).toBeUndefined();
      if (mode === "invalid-source" || mode === "blocked")
        expect(state.analysisAssessment?.status).toBe("blocked");
      else expect(state.analysisRefinement?.status).toBe("denied");
      expect(command).toHaveBeenCalledTimes(mode === "round-limit" ? 3 : 1);
      expect(reservations()).toHaveLength(mode === "round-limit" ? 3 : 1);
      expect(issuanceCount()).toBe(mode === "round-limit" ? 3 : 1);
      if (mode === "round-limit") {
        const round = withGovernanceRecords((raw) => {
          const ledger =
            raw as import("@/application/governance/model/ledger.js").GovernanceLedger;
          return Object.values(ledger.repositories)[0].analysisRefinements![0];
        });
        expect(
          governance.authorizeSpecialistInvocation(
            round.requests[0],
            undefined,
            round.id
          ).status
        ).toBe("denied");
      }
    }
  );

  it.each([
    "reuse",
    "extension",
    "addition",
    "human",
    "pending",
    "budget",
    "partial",
  ] as const)("runs governed Analysis Refinement for %s", async (mode) => {
    mkdirSync(join(root, "docs"));
    writeFileSync(join(root, "docs", "note.txt"), "Additional context\n");
    git("add", ".");
    git("commit", "--quiet", "-m", "Add analysis context");
    system.availableSpecialists.push({
      ...system.availableSpecialists[0],
      id: "ux",
    });
    system.contextAccessPolicy.allowedScopes.push({
      kind: "directory",
      path: "docs",
    });
    const maxInvocations = mode === "budget" ? 1 : mode === "partial" ? 3 : 2;
    system.maxAgentInvocations = Math.max(
      system.maxAgentInvocations,
      maxInvocations
    );
    draft.budget.maxAgentInvocations = maxInvocations;
    configure();
    if (mode === "human" || mode === "pending") delegate();
    else
      delegate(
        Math.max(2, maxInvocations),
        ["frontend", "ux"],
        system.contextAccessPolicy.allowedScopes
      );
    const command = runtime();
    if (mode === "partial") {
      const simulate = command.getMockImplementation()!;
      command.mockImplementation(async (...args) => {
        const prompt = args[1].at(-1)!;
        if (
          prompt.includes("SpecialistContext:\n") &&
          prompt.includes("Assess UX risks")
        )
          throw new Error("Specialist unavailable");
        return simulate(...args);
      });
    }
    const context = [{ kind: "directory", path: "docs" }];
    const change =
      mode === "extension"
        ? {
            kind: "context-extension",
            specialistId: "frontend",
            context,
            reason: "Check missing repository evidence",
          }
        : mode === "addition" ||
            mode === "human" ||
            mode === "pending" ||
            mode === "partial"
          ? {
              kind: "specialist-addition",
              specialistId: "ux",
              context,
              objective: "Assess UX risks",
              reason: "Need a second perspective",
            }
          : {
              kind: "re-evaluation",
              specialistId: "frontend",
              reason: "Review the evidence again",
            };
    const sources = [{ kind: "recommendation", specialistId: "frontend" }];
    const assessmentAgent = vi
      .fn<
        NonNullable<
          NonNullable<Parameters<typeof createGraph>[0]>["assessmentAgent"]
        >
      >(async () => ({
        status: "sufficient",
        reason: "Sufficient evidence",
        sources,
      }))
      .mockResolvedValueOnce({
        status: "refinement-required",
        reason: "Analysis gap",
        sources,
        changes:
          mode === "partial"
            ? [
                {
                  kind: "re-evaluation",
                  specialistId: "frontend",
                  objective: "Review a new aspect",
                  reason: "Check coverage",
                },
                change,
              ]
            : [change],
      });
    const confirmApproval = vi.fn(accept);
    const graph = createPhaseAGraph({
      ...options,
      assessmentAgent,
      confirmApproval,
      allowDirectStaffingApproval: mode === "human",
      executionTarget: "independent-direction-review",
      confirmDirection: (request) =>
        confirmHumanAction(request.binding, JSON.stringify(request)),
    });
    const config = { configurable: { thread_id: "refinement" } };
    const state = await graph.invoke(
      { goal: options.goal, repositoryPath: root },
      config
    );
    if (mode === "partial") {
      const records = reservations();
      expect(records).toHaveLength(3);
      expect(records[1].decisionDigest).toBeDefined();
      expect(records[2].claimedAt).toBeDefined();
      expect(records[2].decisionDigest).toBeUndefined();
      expect(state.specialistDecisionsResult?.status).toBe("failed");
      expect(
        state.analysisRepresentatives?.map(({ invocationId }) => invocationId)
      ).toEqual([records[0].invocationId]);
      expect(assessmentAgent).toHaveBeenCalledTimes(1);
      expect(state.synthesisResult).toBeUndefined();
      return;
    }
    if (mode === "pending" || mode === "budget") {
      expect(state.analysisRefinement?.status).toBe(
        mode === "budget" ? "denied" : "approval-required"
      );
      expect(confirmApproval).not.toHaveBeenCalled();
      expect(state.synthesisResult).toBeUndefined();
      expect(reservations()).toHaveLength(1);
      return;
    }
    expect(confirmApproval).toHaveBeenCalledTimes(mode === "human" ? 1 : 0);
    expect(assessmentAgent).toHaveBeenCalledTimes(2);
    expect(options.agent).toHaveBeenCalledTimes(1);
    const records = reservations();
    expect(records).toHaveLength(2);
    expect(
      records.every(
        ({ claimedAt, decisionDigest }) => claimedAt && decisionDigest
      )
    ).toBe(true);
    expect(records[1].scopeId === records[0].scopeId).toBe(mode === "reuse");
    expect(issuanceCount()).toBe(mode === "reuse" ? 1 : 2);
    const review = state.directionReview!;
    expect(review).toBeDefined();
    expect(review.analysisInvocationIds).toEqual(
      mode === "addition" || mode === "human"
        ? records.map(({ invocationId }) => invocationId)
        : [records[1].invocationId]
    );
    const final = await graph.invoke(
      new Command({
        resume: {
          action: "approve",
          reviewId: review.id,
          binding: review.binding,
        },
      }),
      config
    );
    expect(final.directionGovernanceResult?.status).toBe("approved");
    if (
      mode === "addition" &&
      final.directionGovernanceResult?.status === "approved"
    ) {
      const id = final.directionGovernanceResult.decision.id;
      withGovernanceRecords((raw, persist) => {
        const ledger =
          raw as import("@/application/governance/model/ledger.js").GovernanceLedger;
        Object.values(ledger.repositories)[0].reservations![1].decisionDigest =
          "0".repeat(64);
        persist(ledger);
      });
      expect(() => governance.getApprovedDecision(id)).toThrow(
        "successful claimed Assignment"
      );
    }
  });
  const confirmDirection = (request: governance.DirectionConfirmationRequest) =>
    confirmHumanAction(request.binding, JSON.stringify(request));

  const executionPolicy: governance.ExecutionSystemPolicy = {
    readPaths: ["README.md"],
    writePaths: ["README.md"],
    shellCommands: ["git diff --check"],
    budget: { maxExecutions: 2, maxTimeoutMs: 30_000 },
    maxDelegationDurationMs: 60 * 60_000,
  };

  function configureExecutionPolicy(
    policy: governance.ExecutionSystemPolicy | null = executionPolicy
  ) {
    const request = governance.configureExecutionSystemPolicy(root, policy);
    if (request.status !== "confirmation-required")
      throw new Error("Missing policy confirmation request");
    const receipt = confirmHumanAction(
      request.binding,
      JSON.stringify(request)
    )!;
    expect(
      governance.configureExecutionSystemPolicy(root, policy, receipt)
    ).toEqual({ status: "configured", version: request.version });
    return request.version;
  }

  const delegationDraft = {
    readScopes: [{ kind: "file", path: "README.md" }],
    writeScopes: [{ kind: "file", path: "README.md" }],
    shellCommands: ["git diff --check"],
    budget: { maxExecutions: 2, maxTimeoutMs: 20_000 },
    durationMs: 30 * 60_000,
    rationale:
      "The direction changes documentation within the anticipated scope.",
    sources: [{ kind: "recommendation", specialistId: "frontend" }],
  };

  it.each([
    "missing-proposal",
    "direction-only",
    "invalid-confirmation",
    "policy-changed",
    "revision",
  ] as const)("enforces normal Phase A completion for %s", async (mode) => {
    const version = configureExecutionPolicy();
    const confirm = vi.fn(
      mode === "invalid-confirmation"
        ? () => ({ token: "invalid" })
        : (request: Parameters<typeof confirmDirection>[0]) => {
            const receipt = confirmDirection(request);
            if (mode === "policy-changed") configureExecutionPolicy();
            return receipt;
          }
    );
    const agent = vi.fn(async () =>
      mode === "missing-proposal" ? null : delegationDraft
    );
    const { graph, config, pending } = await pendingDirection(
      1,
      confirm,
      agent,
      true
    );
    if (mode === "missing-proposal") {
      expect(pending.synthesisResult?.status).toBe("proposed");
      expect(pending.directionReview).toBeUndefined();
      expect(pending.phaseACompletion?.status).toBe("blocked");
      expect(confirm).not.toHaveBeenCalled();
      return;
    }
    expect(pending.phaseACompletion?.status).toBe("incomplete");
    let review = pending.directionReview!;
    if (mode === "revision") {
      const revised = await graph.invoke(
        new Command({
          resume: {
            action: "request-revision",
            reviewId: review.id,
            binding: review.binding,
            feedback: "Clarify execution scope",
          },
        }),
        config
      );
      expect(revised.directionReview?.previousReviewId).toBe(review.id);
      expect(
        revised.directionReview?.executionDelegationProposal
      ).toBeDefined();
      expect(agent).toHaveBeenCalledTimes(2);
      review = revised.directionReview!;
    }
    const final = await graph.invoke(
      new Command({
        resume:
          mode === "direction-only"
            ? {
                action: "approve",
                reviewId: review.id,
                binding: review.binding,
              }
            : delegatedAction(review, version),
      }),
      config
    );
    expect(final.phaseACompletion?.status).toBe(
      mode === "direction-only"
        ? "incomplete"
        : mode === "revision"
          ? "completed"
          : mode === "policy-changed"
            ? "blocked"
            : "denied"
    );
    if (mode === "direction-only") expect(confirm).not.toHaveBeenCalled();
  });

  it.each([
    "expired",
    "revoked",
    "superseded",
    "mismatched",
    "missing",
  ] as const)(
    "rejects a %s Handoff before Phase B decomposition",
    async (mode) => {
      const version = configureExecutionPolicy();
      const { graph, config, pending } = await pendingDirection(
        1,
        confirmDirection,
        async () => delegationDraft,
        true
      );
      const final = await graph.invoke(
        new Command({
          resume: delegatedAction(pending.directionReview!, version),
        }),
        config
      );
      const completed = final.phaseACompletion;
      if (completed?.status !== "completed")
        throw new Error(JSON.stringify(completed));
      if (mode === "expired")
        vi.spyOn(Date, "now").mockReturnValue(
          Date.parse(completed.executionDelegation.grant.expiresAt)
        );
      if (mode === "revoked") configureExecutionPolicy(null);
      if (mode === "superseded") configureExecutionPolicy();
      const input = structuredClone(completed);
      if (mode === "mismatched")
        input.executionDelegation.approvedDecisionId = "another-decision";
      const agent = vi.fn();
      const phaseB = createPhaseBGraph({ workDecomposition: { agent } });
      if (mode === "missing") {
        const { executionDelegation: _grant, ...incomplete } = input;
        const result = await phaseB
          .invoke({ handoff: incomplete as typeof input })
          .catch(() => undefined);
        if (result) expect(result.handoffResult?.status).toBe("denied");
      } else {
        const result = await phaseB.invoke({ handoff: input });
        expect(result.handoffResult?.status).toBe("denied");
        expect(result.workDecompositionResult).toBeUndefined();
      }
      expect(agent).not.toHaveBeenCalled();
    }
  );

  it.each([
    "exact",
    "narrower",
    "direction-only",
    "over-policy",
    "failure",
    "invalid-confirmation",
  ] as const)(
    "reviews a CEO Execution Delegation proposal with %s outcome",
    async (mode) => {
      const version = configureExecutionPolicy();
      const agent = vi.fn<governance.ExecutionDelegationProposalAgent>(
        async () => {
          if (mode === "failure") throw new Error("Test failure");
          if (mode === "over-policy")
            return {
              ...delegationDraft,
              budget: { ...delegationDraft.budget, maxExecutions: 3 },
            };
          return delegationDraft;
        }
      );
      const confirm = vi.fn(
        (request: governance.DirectionConfirmationRequest) => {
          if (mode !== "invalid-confirmation") return confirmDirection(request);
          const { executionDelegation: _grant, ...directionOnly } =
            request.action as Extract<
              governance.DirectionAction,
              { action: "approve" }
            >;
          return confirmDirection(
            governance.prepareDirectionConfirmation(directionOnly)
          );
        }
      );
      const { graph, config, pending } = await pendingDirection(
        1,
        confirm,
        agent
      );
      const review = pending.directionReview!;
      expect(agent).toHaveBeenCalledExactlyOnceWith(
        expect.objectContaining({
          synthesis: review.proposal,
          policy: executionPolicy,
        })
      );
      const advisory = review.executionDelegationProposal;
      if (mode === "failure" || mode === "over-policy")
        expect(advisory).toBeUndefined();
      else
        expect(advisory).toMatchObject({
          ...delegationDraft,
          policyVersion: version,
          synthesisDigest: governanceDigest(review.proposal),
        });

      const action = {
        action: "approve",
        reviewId: review.id,
        binding: review.binding,
      };
      const grant =
        mode === "exact" ||
        mode === "narrower" ||
        mode === "invalid-confirmation"
          ? {
              readScopes: delegationDraft.readScopes,
              writeScopes: delegationDraft.writeScopes,
              shellCommands:
                mode === "narrower" ? [] : delegationDraft.shellCommands,
              budget:
                mode === "narrower"
                  ? { maxExecutions: 1, maxTimeoutMs: 10_000 }
                  : delegationDraft.budget,
              policyVersion: version,
              expiresAt: new Date(
                Date.now() + delegationDraft.durationMs
              ).toISOString(),
            }
          : undefined;
      const final = await graph.invoke(
        new Command({
          resume: { ...action, ...(grant && { executionDelegation: grant }) },
        }),
        config
      );
      if (mode === "invalid-confirmation") {
        expect(final.directionGovernanceResult?.status).toBe("denied");
        expect(
          governance.getDirectionReview(review.id).review.resolution
        ).toBeUndefined();
        return;
      }
      const result = final.directionGovernanceResult;
      if (result?.status !== "approved")
        throw new Error(JSON.stringify(result));
      expect(result.executionDelegation?.grant).toEqual(grant);
      expect(governance.getExecutionDelegation(result.decision.id)).toEqual(
        result.executionDelegation
      );
      expect(
        governance.getApprovedDecision(result.decision.id).review
          .executionDelegationProposal
      ).toEqual(advisory);
    }
  );

  it("replaces the CEO Execution Delegation proposal on Human revision without reusing the previous suggestion", async () => {
    configureExecutionPolicy();
    const agent = vi
      .fn<governance.ExecutionDelegationProposalAgent>()
      .mockResolvedValueOnce(delegationDraft)
      .mockResolvedValueOnce(null);
    const { graph, config, pending } = await pendingDirection(
      1,
      confirmDirection,
      agent
    );
    const review = pending.directionReview!;
    expect(review.executionDelegationProposal).toBeDefined();
    const revised = await graph.invoke(
      new Command({
        resume: {
          action: "request-revision",
          reviewId: review.id,
          binding: review.binding,
          feedback: "Clarify assumptions",
        },
      }),
      config
    );
    expect(agent).toHaveBeenCalledTimes(2);
    expect(revised.directionReview?.previousReviewId).toBe(review.id);
    expect(
      revised.directionReview?.executionDelegationProposal
    ).toBeUndefined();
    expect(revised.directionGovernanceResult).toBeUndefined();
    expect(reservations()).toHaveLength(1);
  });

  function delegatedAction(
    review: governance.DirectionReview,
    policyVersion: number
  ) {
    return {
      reviewId: review.id,
      binding: review.binding,
      action: "approve" as const,
      executionDelegation: {
        readPaths: ["README.md"],
        writePaths: ["README.md"],
        shellCommands: ["git diff --check" as const],
        budget: { maxExecutions: 1, maxTimeoutMs: 15_000 },
        policyVersion,
        expiresAt: new Date(Date.now() + 30 * 60_000).toISOString(),
      },
    };
  }

  async function planExecutionItems(
    withDelegation = true,
    maxExecutions = 1,
    _verification = ["git diff --check"],
    target = "README.md",
    {
      fastPath = false,
      directoryScope = false,
      codexMode = false,
      beforePhaseB,
      assignmentAgent,
      assignmentExecution,
      specialistCount = 1,
    }: {
      fastPath?: boolean;
      directoryScope?: boolean;
      codexMode?: boolean;
      specialistCount?: number;
      beforePhaseB?: (approvedDirection: string) => void;
      assignmentExecution?: PhaseBGraphOptions["assignmentExecution"];
      assignmentAgent?: PhaseBGraphOptions["assignmentPlanning"];
    } = {}
  ) {
    mkdirSync(join(root, "docs"), { recursive: true });
    mkdirSync(join(root, "docs-extra"), { recursive: true });
    writeFileSync(join(root, target), "Original content\n");
    writeFileSync(join(root, "docs-extra", "other.md"), "Outside scope\n");
    symlinkSync("../a.ts", join(root, "docs", "link.ts"));
    git("add", target, "docs/link.ts", "docs-extra/other.md");
    git("commit", "--quiet", "-m", "Add execution target");
    const workerMode = codexMode
      ? { workerMode: "codex-worktree" as const }
      : {};
    const policyVersion = withDelegation
      ? configureExecutionPolicy({
          ...(directoryScope ? scopedPolicy : executionPolicy),
          ...workerMode,
        })
      : undefined;
    const {
      pending,
      graph: phaseA,
      config,
    } = await pendingDirection(
      specialistCount,
      confirmDirection,
      withDelegation
        ? async () =>
            directoryScope
              ? {
                  ...delegationDraft,
                  ...workerMode,
                  readScopes: scopedPolicy.readScopes,
                  writeScopes: scopedPolicy.writeScopes,
                }
              : { ...delegationDraft, ...workerMode }
        : undefined,
      withDelegation,
      fastPath ? target : undefined
    );
    const review = pending.directionReview!;
    const approved = await phaseA.invoke(
      new Command({
        resume:
          policyVersion === undefined
            ? {
                reviewId: review.id,
                binding: review.binding,
                action: "approve",
              }
            : {
                ...delegatedAction(review, policyVersion),
                executionDelegation: {
                  ...(directoryScope
                    ? {
                        readScopes: scopedPolicy.readScopes,
                        writeScopes: scopedPolicy.writeScopes,
                        shellCommands: scopedPolicy.shellCommands,
                        policyVersion,
                        expiresAt: delegatedAction(review, policyVersion)
                          .executionDelegation.expiresAt,
                      }
                    : delegatedAction(review, policyVersion)
                        .executionDelegation),
                  ...workerMode,
                  budget: { maxExecutions, maxTimeoutMs: 15_000 },
                },
              },
      }),
      config
    );
    if (approved.directionGovernanceResult?.status !== "approved")
      throw new Error(JSON.stringify(approved.directionGovernanceResult));
    const decision = approved.directionGovernanceResult.decision;
    const workItems = ["first", "second", "third"].map((id) => ({
      id,
      objective: fastPath
        ? `Fix typos in ${target}`
        : `Revise ${id} wording in ${target}`,
      deliverable: fastPath
        ? `Corrected typos in ${target}`
        : `Revised ${target}`,
      dependsOn: [],
    }));
    const agent = async () => ({ type: "propose", workItems });
    const handoff = approved.phaseACompletion;
    let assignmentPlanResult;
    let assignmentExecutionResult;
    if (withDelegation) {
      if (handoff?.status !== "completed")
        throw new Error(JSON.stringify(handoff));
      beforePhaseB?.(review.proposal.direction.text);
      const state = await createPhaseBGraph({
        workDecomposition: { agent },
        ...(assignmentAgent && {
          assignmentPlanning: assignmentAgent,
          selectWorkItemIds: () => ["first"],
        }),
        assignmentExecution,
      }).invoke({ handoff });
      expect(state.handoffResult?.status).toBe("accepted");
      assignmentPlanResult = state.assignmentPlanResult;
      assignmentExecutionResult = state.assignmentExecutionResult;
    } else {
      const decomposition = await runWorkDecomposition(
        { approvedDecisionId: decision.id },
        { agent }
      );
      if (decomposition.status !== "proposed")
        throw new Error(JSON.stringify(decomposition));
      registerWorkDecomposition(decomposition);
    }
    return {
      assignmentPlanResult,
      assignmentExecutionResult,
      handoff,
      decision,
      workItems,
    };
  }

  it("prepares a provenance-bound Assignment Plan without starting execution", async () => {
    const assignmentAgent = vi.fn<
      NonNullable<PhaseBGraphOptions["assignmentPlanning"]>
    >(async ({ specialists }) =>
      specialists.map(({ id }, index) => ({
        id: `assignment-${index}`,
        workItemId: "first",
        specialistId: id,
        repositoryAccessCeiling: "read",
        objective: "Assess the existing wording",
        deliverable: "Evidence-linked findings",
        dependsOn: [],
      }))
    );
    const { handoff, assignmentPlanResult, decision, workItems } =
      await planExecutionItems(true, 1, [], "README.md", {
        assignmentAgent,
      });
    expect(handoff?.status).toBe("completed");
    if (
      handoff?.status !== "completed" ||
      assignmentPlanResult?.status !== "prepared"
    )
      throw new Error(JSON.stringify(assignmentPlanResult));
    const { plan } = assignmentPlanResult;
    const approval = governance.getApprovedDecision(handoff.decision.id);
    const preparedContext = withGovernanceLedger((ledger) =>
      prepareAssignmentContext(ledger, handoff)
    );
    expect(preparedContext.context).toEqual(approval.context);
    expect(preparedContext.synthesisProposal).toEqual(approval.review.proposal);
    expect(preparedContext.analysisSources).toHaveLength(
      approval.context.decisions.length
    );
    expect(preparedContext.staffingBinding).toBe(plan.staffingBinding);
    expect(Object.keys(assignmentAgent.mock.calls[0][0]).sort()).toEqual([
      "repositoryAccessCeilings",
      "specialists",
      "workItems",
    ]);

    const persisted = governance.getPreparedAssignmentPlan(handoff, plan.id);
    expect(persisted.plan).toEqual(plan);
    const { id, ...subject } = plan;
    expect(plan.selectedWorkItemIds).toEqual(["first"]);
    expect(id).toBe(governanceDigest(subject));

    expect(persisted.specialistSources[0]).toMatchObject({
      definition: {
        id: expect.any(String),
        role: expect.any(String),
        objective: expect.any(String),
      },
      assignmentId: expect.any(String),
      approvalRecordId: expect.any(String),
    });
    expect(persisted.specialistSources[0].definition).not.toHaveProperty(
      "authority"
    );
    expect(
      withGovernanceRecords((raw) =>
        Object.values(
          (
            raw as import("@/application/governance/model/ledger.js").GovernanceLedger
          ).repositories
        ).flatMap(({ executionReservations }) => executionReservations ?? [])
      )
    ).toEqual([]);

    const proposal = {
      status: "proposed" as const,
      approvedDecisionId: decision.id,
      workItems,
    };
    const [assignment] = plan.assignments;
    const rejects = [
      [
        {
          ...assignment,
          specialistId: "not-registered",
        },
      ],
      [{ ...assignment, specialistId: "ux" }],
      [{ ...assignment, workItemId: "unbound" }],
      [{ ...assignment, workItemId: "second" }],
      [{ ...assignment, repositoryAccessCeiling: "write" }],
      [{ ...assignment, role: "Forged role" }],
      [{ ...assignment, readPaths: ["outside.txt"] }],
      [{ ...assignment, id: "" }],
      [assignment, assignment],
      [{ ...assignment, dependsOn: ["missing"] }],
      [{ ...assignment, dependsOn: [assignment.id] }],
      [
        { ...assignment, dependsOn: ["other"] },
        { ...assignment, id: "other", dependsOn: [assignment.id] },
      ],
      [{ ...assignment, executor: { kind: "worker", mode: "codex-worktree" } }],
    ];
    for (const candidate of rejects)
      expect(() =>
        governance.registerAssignmentPlan(handoff, proposal, candidate, [
          "first",
        ])
      ).toThrow();
    expect(() =>
      governance.registerAssignmentPlan(
        handoff,
        {
          ...proposal,
          workItems: workItems.map((item) => ({
            ...item,
            objective: "Forged",
          })),
        },
        plan.assignments,
        ["first"]
      )
    ).toThrow(governance.AssignmentRegistrationError);
    const ledgerPath = join(home, ".ai-workspace-governance", "records.json");
    const original = readFileSync(ledgerPath, "utf8");
    withGovernanceRecords((raw, save) => {
      const ledger =
        raw as import("@/application/governance/model/ledger.js").GovernanceLedger;
      const entry = Object.values(ledger.repositories).find(
        (item) => item.assignmentPlans?.length
      )!;
      entry.assignmentPlans![0].selectedWorkItemIds = ["second"];
      save(ledger);
    });
    expect(() =>
      governance.getPreparedAssignmentPlan(handoff, plan.id)
    ).toThrow("Invalid Assignment Plan binding");
    writeFileSync(ledgerPath, original);
    withGovernanceRecords((raw, save) => {
      const ledger =
        raw as import("@/application/governance/model/ledger.js").GovernanceLedger;
      const entry = Object.values(ledger.repositories).find(
        (item) => item.assignmentPlans?.length
      )!;
      const {
        selectedWorkItemIds: _selection,
        assignments,
        id: _id,
        ...binding
      } = entry.assignmentPlans![0];
      const legacy = {
        ...binding,
        assignments: assignments.map(
          ({ specialistId, repositoryAccessCeiling: _ceiling, ...item }) => ({
            ...item,
            executor: { kind: "specialist", specialistId },
          })
        ),
      };
      save({
        ...ledger,
        repositories: Object.fromEntries(
          Object.entries(ledger.repositories).map(([key, value]) => [
            key,
            value === entry
              ? {
                  ...value,
                  assignmentPlans: [
                    { ...legacy, id: governanceDigest(legacy) },
                  ],
                }
              : value,
          ])
        ),
      });
    });
    const legacyLedger = readFileSync(ledgerPath, "utf8");
    expect(() =>
      governance.getPreparedAssignmentPlan(handoff, plan.id)
    ).toThrow();
    expect(readFileSync(ledgerPath, "utf8")).toBe(legacyLedger);
    writeFileSync(ledgerPath, original);
    writeFileSync(join(root, "README.md"), "Snapshot drift");
    expect(() =>
      governance.getPreparedAssignmentPlan(handoff, plan.id)
    ).toThrow();
    expect(() =>
      governance.registerAssignmentPlan(handoff, proposal, plan.assignments, [
        "first",
      ])
    ).toThrow();
  });

  it.each([
    "read",
    "write",
    "bad-evidence",
    "drift",
    "expired",
    "policy-change",
    "save-failure",
  ] as const)(
    "runs a requested Phase B Specialist read with %s",
    async (mode) => {
      let suppliedDirection: string | undefined;
      const specialistCalls: string[][] = [];
      const started = Date.now();
      const before = () => readFileSync(join(root, "README.md"), "utf8");
      const { assignmentExecutionResult, assignmentPlanResult, handoff } =
        await planExecutionItems(true, 2, [], "README.md", {
          codexMode: true,
          assignmentAgent: async ({ specialists }) =>
            ["review", "dependent"].map((id) => ({
              id,
              workItemId: "first",
              specialistId: specialists[0].id,
              objective: "Inspect the supplied README",
              deliverable: "Scoped findings",
              repositoryAccessCeiling: mode === "write" ? "write" : "read",
              dependsOn: id === "dependent" ? ["review"] : [],
            })),
          assignmentExecution: {
            contexts: Object.fromEntries(
              ["review", "dependent"].map((id) => [
                id,
                {
                  readScopes: [{ kind: "file", path: "README.md" }],
                  timeoutMs: 5000,
                },
              ])
            ),
          },
          beforePhaseB(direction) {
            suppliedDirection = direction;
            const command = vi.mocked(processRuntime.runCommand);
            const previous = command.getMockImplementation()!;
            command.mockImplementation(async (name, args, options) => {
              if (name !== "codex") return previous(name, args, options);
              specialistCalls.push(args);
              if (mode === "drift")
                writeFileSync(join(root, "README.md"), "Snapshot drift");
              if (mode === "expired")
                vi.spyOn(Date, "now").mockReturnValue(started + 60_000);
              if (mode === "policy-change") configureExecutionPolicy(null);
              if (mode === "save-failure")
                vi.spyOn(filesystem, "renameSync").mockImplementationOnce(
                  () => {
                    throw new Error("Unable to persist read result");
                  }
                );
              expect(options.cwd).not.toBe(root);
              return {
                stdout: JSON.stringify({
                  recommendation: "Review complete",
                  evidence: [
                    {
                      path:
                        mode === "bad-evidence"
                          ? "docs-extra/other.md"
                          : "README.md",
                      lineStart: 1,
                      description: "Relevant text",
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
          },
        });
      expect(specialistCalls).toHaveLength(1);
      expect(specialistCalls[0]).toContain("read-only");
      expect(specialistCalls[0].join(" ")).toContain("shell_tool=false");
      const prompt = specialistCalls[0].at(-1)!;
      expect(JSON.parse(prompt.split("SpecialistContext:\n")[1])).toMatchObject(
        {
          approvedDirection: suppliedDirection,
          workItem: { id: "first", deliverable: "Revised README.md" },
          assignmentObjective: "Inspect the supplied README",
          assignmentDeliverable: "Scoped findings",
          predecessorResults: [],
          files: [{ path: "README.md", content: "Original content\n" }],
          repositoryFiles: [{ path: "README.md", size: 17 }],
        }
      );
      if (mode === "drift")
        writeFileSync(join(root, "README.md"), "Original content\n");
      if (mode === "expired") vi.mocked(Date.now).mockRestore();
      const failures = {
        "bad-evidence": "validation",
        drift: "snapshot",
        expired: "claim",
        "policy-change": "handoff",
        "save-failure": "handoff",
      } as const;
      const failure =
        mode === "read" || mode === "write" ? undefined : failures[mode];
      const expected = failure
        ? { status: "failed", failure, failureRecorded: true }
        : { status: "read-completed" };
      expect(assignmentExecutionResult).toMatchObject({
        status: failure ? "failed" : "pending",
        results: [{ assignmentId: "review", ...expected }],
        pendingAssignments: [
          { assignmentId: "dependent", reason: "dependency-pending" },
        ],
      });
      if (
        handoff?.status !== "completed" ||
        assignmentPlanResult?.status !== "prepared"
      )
        throw new Error("Expected prepared Plan and Handoff");
      if (mode === "policy-change") {
        expect(() =>
          governance.getAssignmentExecutionResults(
            handoff,
            assignmentPlanResult.plan.id
          )
        ).toThrow();
      } else {
        expect(
          governance.getAssignmentExecutionResults(
            handoff,
            assignmentPlanResult.plan.id
          )
        ).toMatchObject([{ assignmentId: "review", ...expected }]);
      }
      expect(before()).toBe("Original content\n");
    }
  );

  it.each(["assignment-only", "dependent", "independent"] as const)(
    "prepares approved Specialists with read and write ceilings in %s Planning",
    async (mode) => {
      const assignmentAgent: NonNullable<
        PhaseBGraphOptions["assignmentPlanning"]
      > = async ({ specialists, workItems, repositoryAccessCeilings }) => {
        expect(specialists).toHaveLength(2);
        expect(workItems.map(({ id }) => id)).toEqual(["first"]);
        expect(repositoryAccessCeilings).toEqual(["read", "write"]);
        const assignments = specialists.map(({ id }) => ({
          id,
          workItemId: "first",
          specialistId: id,
          repositoryAccessCeiling: "read",
          objective: "Review existing behavior",
          deliverable: "Findings",
          dependsOn: [],
        }));
        return [
          ...assignments,
          {
            id: "implement",
            workItemId: "first",
            specialistId: specialists[0].id,
            repositoryAccessCeiling: "write",
            objective: "Implement approved direction",
            deliverable: "Patch",
            dependsOn:
              mode === "independent" ? [] : assignments.map(({ id }) => id),
          },
          {
            id: "validate",
            workItemId: "first",
            specialistId: specialists[0].id,
            repositoryAccessCeiling: "write",
            objective: "Prepare test changes",
            deliverable: "Test patch",
            dependsOn: ["implement"],
          },
        ];
      };
      const {
        handoff,
        decision,
        workItems,
        assignmentPlanResult,
        assignmentExecutionResult,
      } = await planExecutionItems(true, 1, [], "README.md", {
        assignmentAgent,
        specialistCount: 2,
        codexMode: true,
      });
      if (
        handoff?.status !== "completed" ||
        assignmentPlanResult?.status !== "prepared"
      )
        throw new Error(JSON.stringify(assignmentPlanResult));
      const prepared = governance.getPreparedAssignmentPlan(
        handoff,
        assignmentPlanResult.plan.id
      );
      expect(
        prepared.plan.assignments.map(
          ({ repositoryAccessCeiling }) => repositoryAccessCeiling
        )
      ).toEqual(["read", "read", "write", "write"]);
      expect(prepared.specialistSources).toHaveLength(2);
      expect(assignmentExecutionResult).toBeUndefined();
      const readRequest = {
        planId: prepared.plan.id,
        access: "read",
        readScopes: [{ kind: "file", path: "README.md" }],
        timeoutMs: 5000,
      };
      const [reviewAssignment] = prepared.plan.assignments;
      const request = { ...readRequest, assignmentId: reviewAssignment.id };
      expect(() =>
        governance.reserveAssignmentExecution(handoff, {
          ...request,
          specialistId: "forged",
        })
      ).toThrow();
      expect(() =>
        governance.reserveAssignmentExecution(handoff, {
          ...request,
          readScopes: [{ kind: "file", path: "docs-extra/other.md" }],
        })
      ).toThrow("authority");
      expect(() =>
        governance.reserveAssignmentExecution(handoff, {
          access: "write",
          planId: request.planId,
          assignmentId: request.assignmentId,
          timeoutMs: 5000,
          readPaths: [],
          taskContractBinding: "a".repeat(64),
        })
      ).toThrow("authority");
      expect(() =>
        governance.reserveAssignmentExecution(handoff, {
          access: "write",
          planId: request.planId,
          assignmentId: "implement",
          timeoutMs: 5000,
          readPaths: [],
          taskContractBinding: "a".repeat(64),
        })
      ).toThrow("unsupported");
      const ledgerPath = join(home, ".ai-workspace-governance", "records.json");
      const before = readFileSync(ledgerPath, "utf8");
      vi.spyOn(filesystem, "renameSync").mockImplementationOnce(() => {
        throw new Error("disk failure");
      });
      expect(() =>
        governance.reserveAssignmentExecution(handoff, request)
      ).toThrow("disk failure");
      expect(readFileSync(ledgerPath, "utf8")).toBe(before);

      const permit = governance.reserveAssignmentExecution(
        handoff,
        mode === "independent"
          ? { ...readRequest, assignmentId: "implement" }
          : request
      );
      expect(permit).toMatchObject({
        access: "read",
        authority: { repositoryAccess: "read", shellExecution: false },
        specialistId: reviewAssignment.specialistId,
      });
      expect(permit).not.toHaveProperty("files");
      expect(() =>
        governance.reserveAssignmentExecution(handoff, {
          ...readRequest,
          assignmentId: permit.assignmentId,
        })
      ).toThrow("duplicate");
      expect(() =>
        governance.reserveAssignmentExecution(handoff, {
          ...readRequest,
          assignmentId: prepared.plan.assignments[1].id,
        })
      ).toThrow("budget");
      expect(() =>
        governance.claimAssignmentExecution(handoff, {
          ...permit,
          specialistId: "forged",
        })
      ).toThrow("claim");
      const competing = governance.registerAssignmentPlan(
        handoff,
        { status: "proposed", approvedDecisionId: decision.id, workItems },
        prepared.plan.assignments.map((item) => ({
          ...item,
          objective: item.objective + " expanded",
        })),
        prepared.plan.selectedWorkItemIds
      );
      expect(competing.id).not.toBe(permit.planId);
      expect(() =>
        governance.reserveAssignmentExecution(handoff, {
          ...request,
          planId: competing.id,
        })
      ).toThrow("duplicate");
      writeFileSync(join(root, "README.md"), "Snapshot drift");
      expect(() =>
        governance.claimAssignmentExecution(handoff, permit)
      ).toThrow();
      writeFileSync(join(root, "README.md"), "Original content\n");
      const clock = vi
        .spyOn(Date, "now")
        .mockReturnValue(Date.parse(permit.expiresAt));
      expect(() =>
        governance.claimAssignmentExecution(handoff, permit)
      ).toThrow();
      clock.mockRestore();
      if (mode === "dependent") {
        configureExecutionPolicy(null);
        expect(() =>
          governance.claimAssignmentExecution(handoff, permit)
        ).toThrow();
        expect(
          governance.getApprovedDecision(handoff.decision.id).decision
        ).toEqual(handoff.decision);
        return;
      }
      const validLedger = readFileSync(ledgerPath, "utf8");
      withGovernanceRecords((raw, save) => {
        const ledger =
          raw as import("@/application/governance/model/ledger.js").GovernanceLedger;
        const record = Object.values(ledger.repositories)[0]
          .assignmentExecutions![0];
        record.execution.policyBinding = "0".repeat(64);
        record.binding = governanceDigest({
          request: record.request,
          execution: record.execution,
        });
        save(ledger);
      });
      expect(() => governance.getApprovedDecision(handoff.decision.id)).toThrow(
        "Invalid Assignment execution record"
      );
      writeFileSync(ledgerPath, validLedger);
      expect(() =>
        governance.consumeAssignmentReadContext(handoff, permit)
      ).toThrow("claim");
      const claimed = governance.claimAssignmentExecution(handoff, permit);
      expect(claimed).toEqual(permit);
      expect(() =>
        governance.consumeAssignmentReadContext(handoff, { ...claimed })
      ).toThrow("claim");
      const session = governance.consumeAssignmentReadContext(handoff, claimed);
      expect(session.context.files).toEqual([
        { path: "README.md", content: "Original content\n" },
      ]);
      expect(() =>
        governance.consumeAssignmentReadContext(handoff, claimed)
      ).toThrow("claim");
      expect(() =>
        governance.claimAssignmentExecution(handoff, permit)
      ).toThrow("claim");
      expect(
        withGovernanceRecords((raw) =>
          Object.values(
            (
              raw as import("@/application/governance/model/ledger.js").GovernanceLedger
            ).repositories
          ).map(({ executionReservations, workItemExecutionSources }) => ({
            executionReservations: executionReservations ?? [],
            workItemExecutionSources: workItemExecutionSources ?? [],
          }))
        )
      ).toEqual([{ executionReservations: [], workItemExecutionSources: [] }]);
      const proposal = {
        status: "proposed" as const,
        approvedDecisionId: decision.id,
        workItems,
      };
      const task = {
        id: "standalone-bypass",
        goalId: "goal",
        objective: workItems[0].objective,
        targetRepository: options.goal.targetRepository,
        allowedPaths: ["README.md"],
        forbiddenPaths: [],
        constraints: options.goal.constraints ?? [],
        acceptanceCriteria: ["Patch"],
        verification: [],
      };
      const executionSourceId = beginWorkItemExecutionSource(
        proposal,
        workItems[0],
        root
      )?.(task);
      expect(executionSourceId).toBeDefined();
      expect(
        governance.authorizeExecutionForRun({
          approvedDecisionId: decision.id,
          executionSourceId,
          task,
          workItem: workItems[0],
          repositoryPath: root,
          readPaths: ["README.md"],
          timeoutMs: 5000,
          workerMode: "codex-worktree",
        })
      ).toMatchObject({
        status: "denied",
      });
    }
  );

  async function plannedExecutions(
    ...args: Parameters<typeof planExecutionItems>
  ) {
    const { decision, workItems } = await planExecutionItems(...args);
    const target = args[3] ?? "README.md";
    const workItem = workItems[0];
    const task = {
      id: "legacy-fixture",
      goalId: "goal",
      objective: workItem.objective,
      targetRepository: options.goal.targetRepository,
      allowedPaths: [target],
      forbiddenPaths: [],
      constraints: options.goal.constraints ?? [],
      acceptanceCriteria: ["Review"],
      verification: args[2] ?? ["git diff --check"],
    };
    const executionSourceId = beginWorkItemExecutionSource(
      { status: "proposed", approvedDecisionId: decision.id, workItems },
      workItem,
      root
    )?.(task);
    expect(executionSourceId).toBeDefined();
    return [
      {
        approvedDecisionId: decision.id,
        executionSourceId: executionSourceId!,
        repositoryPath: root,
        workItem,
        task,
        readPaths: [target],
        timeoutMs: 5000,
      },
    ];
  }

  it("binds Codex Worktree permission to policy and actual Human confirmation", async () => {
    const { pending } = await pendingDirection(1);
    const review = pending.directionReview!;
    const legacyVersion = configureExecutionPolicy();
    const legacyAction = delegatedAction(review, legacyVersion);
    const unsupported = {
      ...legacyAction,
      executionDelegation: {
        ...legacyAction.executionDelegation,
        workerMode: "codex-worktree",
      },
    };
    expect(() => governance.prepareDirectionConfirmation(unsupported)).toThrow(
      /policy/
    );
    const version = configureExecutionPolicy({
      ...executionPolicy,
      workerMode: "codex-worktree",
    });
    const withoutMode = delegatedAction(review, version);
    const withMode = {
      ...withoutMode,
      executionDelegation: {
        ...withoutMode.executionDelegation,
        workerMode: "codex-worktree",
      },
    };
    const narrow = governance.prepareDirectionConfirmation(withoutMode);
    const broad = governance.prepareDirectionConfirmation(withMode);
    expect(broad.workerModeNotice).toMatch(/Worktree/);
    expect(broad.binding).not.toBe(narrow.binding);
    expect(
      governance.finalizeDirectionReview(
        withMode,
        confirmDirection(narrow) ?? undefined
      ).status
    ).toBe("denied");
    expect(
      governance.finalizeDirectionReview(
        withMode,
        confirmDirection(broad) ?? undefined
      )
    ).toMatchObject({
      status: "approved",
      executionDelegation: { grant: { workerMode: "codex-worktree" } },
    });
  });

  it("blocks both direct execution entry points with valid Work Item provenance and no Assignment Plan", async () => {
    const [request] = await plannedExecutions(
      true,
      1,
      ["git diff --check"],
      "README.md",
      { codexMode: true }
    );
    const { task: _task, ...readRequest } = request;
    const path = join(home, ".ai-workspace-governance", "records.json");
    const before = readFileSync(path, "utf8");
    const command = vi.mocked(processRuntime.runCommand);
    const calls = command.mock.calls.length;
    expect(governance.checkExecutionEligibility(request)).toMatchObject({
      status: "denied",
      reason: expect.stringContaining("requires Assignment Authorization"),
    });
    expect(governance.authorizeExecutionForRun(request)).toMatchObject({
      status: "denied",
    });
    await expect(executeReadOnlyWorkItem(readRequest)).resolves.toMatchObject({
      status: "denied",
    });
    expect(command).toHaveBeenCalledTimes(calls);
    expect(readFileSync(path, "utf8")).toBe(before);
  });

  it("rejects a signed legacy decomposition containing workType without rewriting the Ledger", async () => {
    const [request] = await plannedExecutions();
    const path = join(home, ".ai-workspace-governance", "records.json");
    withGovernanceRecords((raw, save) => {
      const ledger =
        raw as import("@/application/governance/model/ledger.js").GovernanceLedger;
      const entry = Object.values(ledger.repositories)[0];
      Object.assign(entry.executionDecompositions![0].workItems[0], {
        workType: "repository-modification",
      });
      save(ledger);
    });
    const before = readFileSync(path, "utf8");
    expect(() =>
      governance.getApprovedDecision(request.approvedDecisionId)
    ).toThrow(/workType/);
    expect(readFileSync(path, "utf8")).toBe(before);
  });

  function postDelegationInput(
    request: { approvedDecisionId: string },
    policy: governance.ExecutionSystemPolicy,
    grantBounds: governance.ExecutionSystemPolicy = policy
  ) {
    const policyVersion = configureExecutionPolicy(policy);
    const { shellCommands, budget } = grantBounds;
    const scopes =
      "readScopes" in grantBounds
        ? {
            readScopes: grantBounds.readScopes,
            writeScopes: grantBounds.writeScopes,
          }
        : {
            readPaths: grantBounds.readPaths,
            writePaths: grantBounds.writePaths,
          };
    return {
      approvedDecisionId: request.approvedDecisionId,
      repositoryPath: root,
      grant: {
        ...scopes,
        shellCommands,
        budget,
        policyVersion,
        expiresAt: new Date(Date.now() + 30 * 60_000).toISOString(),
      },
    };
  }

  function confirmPostDelegation(input: unknown) {
    const prompt = governance.approveExecutionDelegation(input);
    if (prompt.status !== "confirmation-required")
      throw new Error(JSON.stringify(prompt));
    return confirmHumanAction(prompt.binding, JSON.stringify(prompt))!;
  }

  const scopedPolicy = {
    readScopes: [{ kind: "directory" as const, path: "docs" }],
    writeScopes: [{ kind: "directory" as const, path: "docs" }],
    shellCommands: executionPolicy.shellCommands,
    budget: executionPolicy.budget,
    maxDelegationDurationMs: executionPolicy.maxDelegationDurationMs,
  };

  it("records a separately approved directory grant without enabling direct Work Item execution", async () => {
    const [request] = await plannedExecutions(
      false,
      1,
      ["git diff --check"],
      "docs/README.md"
    );
    const before = governance.getApprovedDecision(request.approvedDecisionId);
    expect(
      governance.getExecutionDelegation(request.approvedDecisionId)
    ).toBeUndefined();
    expect(governance.checkExecutionEligibility(request).status).toBe("denied");
    const input = postDelegationInput(request, scopedPolicy);
    const receipt = confirmPostDelegation(input);
    const result = governance.approveExecutionDelegation(input, receipt);
    expect(result).toMatchObject({
      status: "approved",
      executionDelegation: {
        approvedDecisionId: before.decision.id,
        approvalSource: "post-direction",
        grant: input.grant,
      },
    });
    expect(governance.getApprovedDecision(request.approvedDecisionId)).toEqual(
      before
    );
    expect(governance.approveExecutionDelegation(input, receipt).status).toBe(
      "denied"
    );
    expect(governance.approveExecutionDelegation(input).status).toBe("denied");
    expect(
      governance.checkExecutionEligibility({
        ...request,
        readPaths: ["docs-extra/other.md"],
      }).status
    ).toBe("denied");
    expect(
      governance.checkExecutionEligibility({
        ...request,
        readPaths: ["docs/link.ts"],
      }).status
    ).toBe("denied");
    expect(governance.authorizeExecutionForRun(request).status).toBe("denied");
  });

  it("denies post-direction grants with invalid scope, input, or confirmation and leaves failed writes atomic", async () => {
    const [request] = await plannedExecutions(false);
    const input = postDelegationInput(request, executionPolicy);
    const scope = (path: string) => ({ kind: "directory", path });
    for (const path of [
      "docs",
      "../docs",
      "/docs",
      ".git",
      "docs//nested",
      "docs/node_modules",
    ]) {
      expect(
        governance.approveExecutionDelegation({
          ...input,
          grant: {
            shellCommands: input.grant.shellCommands,
            budget: input.grant.budget,
            policyVersion: input.grant.policyVersion,
            expiresAt: input.grant.expiresAt,
            readScopes: [],
            writeScopes: [scope(path)],
          },
        }).status
      ).toBe("denied");
    }
    expect(
      governance.approveExecutionDelegation({
        ...input,
        approvedDecisionId: "wrong",
      }).status
    ).toBe("denied");
    expect(
      governance.approveExecutionDelegation({ ...input, repositoryPath: home })
        .status
    ).toBe("denied");
    const receipt = confirmPostDelegation(input);
    const changed = {
      ...input,
      grant: {
        ...input.grant,
        budget: { ...input.grant.budget, maxExecutions: 1 },
      },
    };
    expect(governance.approveExecutionDelegation(changed, receipt).status).toBe(
      "denied"
    );
    expect(governance.approveExecutionDelegation(input, receipt).status).toBe(
      "denied"
    );
    const path = join(home, ".ai-workspace-governance", "records.json");
    const before = readFileSync(path, "utf8");
    vi.spyOn(filesystem, "renameSync").mockImplementationOnce(() => {
      throw new Error("Test disk failure");
    });
    expect(
      governance.approveExecutionDelegation(input, confirmPostDelegation(input))
        .status
    ).toBe("denied");
    expect(readFileSync(path, "utf8")).toBe(before);
    expect(
      governance.approveExecutionDelegation(input, confirmPostDelegation(input))
        .status
    ).toBe("approved");
    expect(
      governance.getExecutionDelegation(request.approvedDecisionId)
    ).toBeDefined();
    withGovernanceRecords((raw, persist) => {
      const ledger =
        raw as import("@/application/governance/model/ledger.js").GovernanceLedger;
      Object.values(
        ledger.repositories
      )[0].executionDelegations![0].confirmationBinding = "tampered";
      persist(ledger);
    });
    expect(() =>
      governance.getExecutionDelegation(request.approvedDecisionId)
    ).toThrow();
  });

  it.each([false, true])(
    "rejects the retired Detailed Planning option and creates no Work Item execution records (Fast Path %s)",
    async (fastPath) => {
      const planner = vi.fn();
      await planExecutionItems(true, 1, ["git diff --check"], "README.md", {
        fastPath,
        beforePhaseB() {
          const legacyOptions = {
            planning: {
              selectWorkItemIds: () => ["first"],
              detailed: { repositoryPath: root, planner },
            },
          };
          expect(() =>
            createPhaseBGraph(legacyOptions as PhaseBGraphOptions)
          ).toThrow("Unsupported Phase B Graph options");
        },
      });
      expect(planner).not.toHaveBeenCalled();
      withGovernanceRecords((raw) => {
        const ledger =
          raw as import("@/application/governance/model/ledger.js").GovernanceLedger;
        const entry = Object.values(ledger.repositories)[0];
        expect(entry.workItemExecutionSources ?? []).toEqual([]);
        expect(entry.executionReservations ?? []).toEqual([]);
      });
    }
  );

  it.each(["legacy", "scoped"] as const)(
    "confirms Direction and its %s Execution Delegation together through Phase A",
    async (format) => {
      const confirm = vi.fn(confirmDirection);
      const { graph, config, pending, command } = await pendingDirection(
        1,
        confirm
      );
      const legacyAction = delegatedAction(
        pending.directionReview!,
        configureExecutionPolicy(
          format === "legacy" ? executionPolicy : scopedPolicy
        )
      );
      const { policyVersion, expiresAt, shellCommands, budget } =
        legacyAction.executionDelegation;
      const action =
        format === "legacy"
          ? legacyAction
          : {
              ...legacyAction,
              executionDelegation: {
                policyVersion,
                expiresAt,
                shellCommands,
                budget,
                readScopes: scopedPolicy.readScopes,
                writeScopes: scopedPolicy.writeScopes,
              },
            };
      const calls = command.mock.calls.length;
      const state = await graph.invoke(new Command({ resume: action }), config);
      const result = state.directionGovernanceResult;
      if (result?.status !== "approved")
        throw new Error(JSON.stringify(result));
      expect(confirm).toHaveBeenCalledExactlyOnceWith(
        expect.objectContaining({ action })
      );
      const restored = governance.getApprovedDecision(result.decision.id);
      expect(result.executionDelegation).toMatchObject({
        approvedDecisionId: result.decision.id,
        repositoryRoot: root,
        approvalRecordId: result.decision.approvalRecordId,
        approval: restored.review.resolution?.confirmation,
        grant: action.executionDelegation,
        status: "active",
      });
      expect(governance.getExecutionDelegation(result.decision.id)).toEqual(
        result.executionDelegation
      );
      expect(command).toHaveBeenCalledTimes(calls);
      configureExecutionPolicy();
      expect(
        governance.getExecutionDelegation(result.decision.id)?.status
      ).toBe("superseded");
      configureExecutionPolicy(null);
      configureExecutionPolicy();
      expect(
        governance.getExecutionDelegation(result.decision.id)?.status
      ).toBe("revoked");
    }
  );

  it("requires independent Human approval for policy configuration and rejects altered policy receipts", async () => {
    const { pending } = await pendingDirection(1);
    const action = delegatedAction(pending.directionReview!, 1);
    expect(governance.finalizeDirectionReview(action).status).toBe("denied");
    const request = governance.configureExecutionSystemPolicy(
      root,
      executionPolicy
    );
    if (request.status !== "confirmation-required")
      throw new Error("Missing policy confirmation request");
    const receipt = confirmHumanAction(
      request.binding,
      JSON.stringify(request)
    )!;
    const changed = { ...executionPolicy, writePaths: ["other.md"] };
    expect(
      governance.configureExecutionSystemPolicy(root, changed, receipt).status
    ).toBe("denied");
    expect(
      governance.configureExecutionSystemPolicy(root, executionPolicy, receipt)
        .status
    ).toBe("denied");
    expect(governance.finalizeDirectionReview(action).status).toBe("denied");
  });

  it("refuses missing, mismatched and stale confirmations for an Execution Delegation", async () => {
    const { pending } = await pendingDirection(1);
    const review = pending.directionReview!;
    const action = delegatedAction(review, configureExecutionPolicy());
    expect(governance.finalizeDirectionReview(action).status).toBe(
      "confirmation-required"
    );
    const request = governance.prepareDirectionConfirmation(action);
    const receipt = confirmDirection(request)!;
    const changed = {
      ...action,
      executionDelegation: { ...action.executionDelegation, writePaths: [] },
    };
    expect(governance.finalizeDirectionReview(changed, receipt).status).toBe(
      "denied"
    );
    expect(governance.finalizeDirectionReview(action, receipt).status).toBe(
      "denied"
    );
    const staleReceipt = confirmDirection(request)!;
    configureExecutionPolicy();
    expect(
      governance.finalizeDirectionReview(action, staleReceipt).status
    ).toBe("denied");
    expect(
      governance.getDirectionReview(review.id).review.resolution
    ).toBeUndefined();
  });

  it("enforces the approved execution policy ceiling and never upgrades a Direction-only approval", async () => {
    const { pending } = await pendingDirection(1);
    const review = pending.directionReview!;
    const version = configureExecutionPolicy({
      ...executionPolicy,
      writePaths: [],
      shellCommands: [],
    });
    const action = delegatedAction(review, version);
    expect(() => governance.prepareDirectionConfirmation(action)).toThrow(
      "policy"
    );
    expect(governance.finalizeDirectionReview(action).status).toBe("denied");
    const approve = {
      reviewId: review.id,
      binding: review.binding,
      action: "approve",
    };
    const receipt = confirmDirection(
      governance.prepareDirectionConfirmation(approve)
    )!;
    const result = governance.finalizeDirectionReview(approve, receipt);
    if (result.status !== "approved") throw new Error(JSON.stringify(result));
    const nextAction = delegatedAction(review, configureExecutionPolicy());
    expect(governance.finalizeDirectionReview(nextAction, receipt).status).toBe(
      "denied"
    );
    expect(
      governance.getExecutionDelegation(result.decision.id)
    ).toBeUndefined();
  });

  it.each([
    "grant",
    "source",
    "staffing receipt",
    "duplicate",
    "missing",
  ] as const)(
    "rejects a signed Ledger containing an invalid Execution Delegation %s",
    async (tamper) => {
      const { pending } = await pendingDirection(1);
      const action = delegatedAction(
        pending.directionReview!,
        configureExecutionPolicy()
      );
      const receipt = confirmDirection(
        governance.prepareDirectionConfirmation(action)
      )!;
      const result = governance.finalizeDirectionReview(action, receipt);
      if (result.status !== "approved") throw new Error(JSON.stringify(result));
      withGovernanceRecords((raw, persist) => {
        const ledger =
          raw as import("@/application/governance/model/ledger.js").GovernanceLedger;
        const entry = Object.values(ledger.repositories)[0];
        const records = entry.executionDelegations!;
        if (tamper === "grant" && "writePaths" in records[0].grant)
          records[0].grant.writePaths = [];
        if (tamper === "source")
          records[0].approvalRecordId = "other-resolution";
        if (tamper === "staffing receipt")
          entry.executionPolicies![0].approval = entry.systems[0].approval;
        if (tamper === "duplicate") records.push(structuredClone(records[0]));
        if (tamper === "missing") records.pop();
        persist(ledger);
      });
      expect(() =>
        governance.getExecutionDelegation(result.decision.id)
      ).toThrow("Invalid Execution Delegation");
    }
  );

  it.each([1, 2])(
    "issues a trusted ApprovedDecision after interrupt/resume for %i Specialists, without replay",
    async (count) => {
      const { graph, config, pending, command } = await pendingDirection(
        count,
        confirmDirection
      );
      expect(pending.directionGovernanceResult).toBeUndefined();
      const calls = command.mock.calls.length;
      const review = pending.directionReview!;
      const state = await graph.invoke(
        new Command({
          resume: {
            reviewId: review.id,
            binding: review.binding,
            action: "approve",
          },
        }),
        config
      );
      expect(state.directionGovernanceResult?.status).toBe("approved");
      if (state.directionGovernanceResult?.status !== "approved")
        throw new Error(JSON.stringify(state));
      const restored = governance.getApprovedDecision(
        state.directionGovernanceResult.decision.id
      );
      expect(restored.review.proposal).toEqual(
        state.synthesisResult?.status === "proposed"
          ? state.synthesisResult.proposal
          : undefined
      );
      expect(restored.context.goal).toEqual(options.goal);
      expect(restored.review.resolution?.action.action).toBe("approve");
      expect(
        state.directionGovernanceResult.executionDelegation
      ).toBeUndefined();
      expect(state.directionGovernanceResult.decision).not.toHaveProperty(
        "proposal"
      );
      expect(command).toHaveBeenCalledTimes(calls);
      expect(reservations()).toHaveLength(count);
      expect(issuanceCount()).toBe(1);
      expect(
        governance.finalizeDirectionReview({
          reviewId: review.id,
          binding: review.binding,
          action: "approve",
        }).status
      ).toBe("denied");
    }
  );

  it.each(["policy", "repository"] as const)(
    "reads historical Human approval after %s changes while current eligibility remains denied",
    async (change) => {
      const { graph, config, pending, command } = await pendingDirection(
        1,
        confirmDirection
      );
      const review = pending.directionReview!;
      const state = await graph.invoke(
        new Command({
          resume: {
            reviewId: review.id,
            binding: review.binding,
            action: "approve",
          },
        }),
        config
      );
      if (state.directionGovernanceResult?.status !== "approved")
        throw new Error("Missing ApprovedDecision");
      const id = state.directionGovernanceResult.decision.id;
      const original = governance.getApprovedDecision(id);
      if (change === "policy") configure();
      else writeFileSync(join(root, "a.ts"), "Changed after approval");
      const calls = command.mock.calls.length;
      const count = reservations().length;
      expect(governance.getApprovedDecision(id)).toEqual(original);
      expect(() => governance.getDirectionReview(review.id)).toThrow();
      expect(governance.getApprovedStaffingScope(review.scopeId).status).toBe(
        "denied"
      );
      const assignment = original.context.assignments[0];
      expect(
        governance.authorizeSpecialistInvocation({
          scopeId: review.scopeId,
          scopeVersion: review.scopeVersion,
          assignmentId: assignment.assignmentId,
          requestedContextPaths: ["a.ts"],
        }).status
      ).not.toBe("allowed");
      expect(reservations()).toHaveLength(count);
      expect(command).toHaveBeenCalledTimes(calls);
      expect(original.decision).not.toHaveProperty("invocation");
      // Even history-only lookup must still reject a modified signed record binding.
      withGovernanceRecords((raw, persist) => {
        const ledger =
          raw as import("@/application/governance/model/ledger.js").GovernanceLedger;
        Object.values(
          ledger.repositories
        )[0].directionReviews![0].proposal.direction.text =
          "Changed historical proposal";
        persist(ledger);
      });
      expect(() => governance.getApprovedDecision(id)).toThrow("binding");
    }
  );

  it("preserves historical delegated approval after delegation is superseded", async () => {
    configure();
    delegate();
    runtime();
    const graph = createPhaseAGraph({
      ...options,
      executionTarget: "independent-direction-review",
      confirmDirection,
    });
    const config = { configurable: { thread_id: "delegation-history" } };
    const pending = await graph.invoke(
      { goal: options.goal, repositoryPath: root },
      config
    );
    const review = pending.directionReview!;
    const state = await graph.invoke(
      new Command({
        resume: {
          reviewId: review.id,
          binding: review.binding,
          action: "approve",
        },
      }),
      config
    );
    if (state.directionGovernanceResult?.status !== "approved")
      throw new Error("Missing ApprovedDecision");
    const id = state.directionGovernanceResult.decision.id;
    const original = governance.getApprovedDecision(id);
    delegate();
    expect(governance.getApprovedDecision(id)).toEqual(original);
    expect(governance.getApprovedStaffingScope(review.scopeId).status).toBe(
      "denied"
    );
    expect(() => governance.getDirectionReview(review.id)).toThrow();
    expect(() =>
      governance.prepareDirectionConfirmation({
        reviewId: review.id,
        binding: review.binding,
        action: "approve",
      })
    ).toThrow();
  });

  it.each(["approve", "reject", "request-revision"] as const)(
    "persists a successful %s resolution exactly once",
    async (choice) => {
      const { pending } = await pendingDirection(1);
      const review = pending.directionReview!;
      const action =
        choice === "request-revision"
          ? {
              reviewId: review.id,
              binding: review.binding,
              action: choice,
              feedback: "Clarify risks",
            }
          : { reviewId: review.id, binding: review.binding, action: choice };
      const request = governance.prepareDirectionConfirmation(action);
      const receipt = confirmDirection(request)!;
      const original = governanceRecords.withGovernanceRecords;
      const saved = vi.fn();
      vi.spyOn(governanceRecords, "withGovernanceRecords").mockImplementation(
        (operation) =>
          original((raw, persist) =>
            operation(raw, (next) => {
              saved();
              persist(next);
            })
          )
      );
      const result = governance.finalizeDirectionReview(action, receipt);
      expect(result.status).toBe(
        choice === "approve"
          ? "approved"
          : choice === "reject"
            ? "rejected"
            : "revision-requested"
      );
      expect(saved).toHaveBeenCalledTimes(1);
      expect(
        governance.getDirectionReview(review.id).review.resolution?.action
      ).toEqual(action);
    }
  );

  it("does not persist any resolution when confirmation is missing", async () => {
    const { pending } = await pendingDirection(1);
    const review = pending.directionReview!;
    const original = governanceRecords.withGovernanceRecords;
    const saved = vi.fn();
    vi.spyOn(governanceRecords, "withGovernanceRecords").mockImplementation(
      (operation) =>
        original((raw, persist) =>
          operation(raw, (next) => {
            saved();
            persist(next);
          })
        )
    );
    expect(
      governance.finalizeDirectionReview({
        reviewId: review.id,
        binding: review.binding,
        action: "approve",
      })
    ).toEqual({ status: "confirmation-required", reviewId: review.id });
    expect(saved).not.toHaveBeenCalled();
    expect(
      governance.getDirectionReview(review.id).review.resolution
    ).toBeUndefined();
  });

  it.each([false, true])(
    "returns failed on atomic replacement failure with execution delegation %s",
    async (delegate) => {
      const { pending } = await pendingDirection(1);
      const review = pending.directionReview!;
      const action = delegate
        ? delegatedAction(review, configureExecutionPolicy())
        : {
            reviewId: review.id,
            binding: review.binding,
            action: "approve" as const,
          };
      const receipt = confirmDirection(
        governance.prepareDirectionConfirmation(action)
      )!;
      const path = join(home, ".ai-workspace-governance", "records.json");
      const before = readFileSync(path, "utf8");
      const rename = vi
        .spyOn(filesystem, "renameSync")
        .mockImplementationOnce(() => {
          throw Object.assign(new Error("Test disk failure"), { code: "EIO" });
        });
      expect(governance.finalizeDirectionReview(action, receipt).status).toBe(
        "failed"
      );
      expect(rename).toHaveBeenCalledTimes(1);
      expect(readFileSync(path, "utf8")).toBe(before);
      expect(
        governance.getDirectionReview(review.id).review.resolution
      ).toBeUndefined();
      expect(governance.finalizeDirectionReview(action, receipt).status).toBe(
        "denied"
      );
    }
  );

  it.each(["signature", "schema", "access"] as const)(
    "returns failed for Ledger %s errors and burns the supplied receipt",
    async (failure) => {
      const { pending } = await pendingDirection(1);
      const review = pending.directionReview!;
      const action = {
        reviewId: review.id,
        binding: review.binding,
        action: "approve" as const,
      };
      const receipt = confirmDirection(
        governance.prepareDirectionConfirmation(action)
      )!;
      const directory = join(home, ".ai-workspace-governance");
      const path = join(directory, "records.json");
      const before = readFileSync(path, "utf8");
      if (failure === "signature") {
        const envelope = JSON.parse(before);
        envelope.signature = "0".repeat(64);
        writeFileSync(path, JSON.stringify(envelope));
      } else if (failure === "schema") {
        withGovernanceRecords((_raw, persist) =>
          persist({ repositories: { invalid: {} } })
        );
      } else filesystem.chmodSync(directory, 0o755);
      try {
        expect(governance.finalizeDirectionReview(action, receipt).status).toBe(
          "failed"
        );
      } finally {
        filesystem.chmodSync(directory, 0o700);
        writeFileSync(path, before);
      }
      expect(
        governance.getDirectionReview(review.id).review.resolution
      ).toBeUndefined();
      expect(governance.finalizeDirectionReview(action, receipt).status).toBe(
        "denied"
      );
    }
  );

  it.each(["binding", "schema"] as const)(
    "burns confirmation when %s validation rejects before normal consumption",
    async (failure) => {
      const { pending } = await pendingDirection(1);
      const review = pending.directionReview!;
      const action = {
        reviewId: review.id,
        binding: review.binding,
        action: "approve" as const,
      };
      const receipt = confirmDirection(
        governance.prepareDirectionConfirmation(action)
      )!;
      const invalid =
        failure === "binding"
          ? { ...action, binding: "wrong-binding" }
          : { ...action, unexpected: true };
      expect(governance.finalizeDirectionReview(invalid, receipt).status).toBe(
        "denied"
      );
      expect(governance.finalizeDirectionReview(action, receipt).status).toBe(
        "denied"
      );
      expect(
        governance.getDirectionReview(review.id).review.resolution
      ).toBeUndefined();
    }
  );

  it("records Reject without issuing an ApprovedDecision", async () => {
    const { graph, config, pending } = await pendingDirection(
      1,
      confirmDirection
    );
    const review = pending.directionReview!;
    const state = await graph.invoke(
      new Command({
        resume: {
          reviewId: review.id,
          binding: review.binding,
          action: "reject",
        },
      }),
      config
    );
    expect(state.directionGovernanceResult?.status).toBe("rejected");
    withGovernanceRecords((raw) =>
      expect(
        Object.values(
          (
            raw as import("@/application/governance/model/ledger.js").GovernanceLedger
          ).repositories
        )[0].approvedDecisions
      ).toBeUndefined()
    );
  });

  it("does not treat Resume input or a forged receipt as Human authentication", async () => {
    const { graph, config, pending } = await pendingDirection(1);
    const review = pending.directionReview!;
    const action = {
      reviewId: review.id,
      binding: review.binding,
      action: "approve" as const,
    };
    const state = await graph.invoke(new Command({ resume: action }), config);
    expect(state.directionGovernanceResult?.status).toBe(
      "confirmation-required"
    );
    expect(
      governance.finalizeDirectionReview(action, { token: "forged" }).status
    ).toBe("denied");
    expect(
      governance.getDirectionReview(review.id).review.resolution
    ).toBeUndefined();
  });

  it.each(["binding", "action", "proposal"])(
    "rejects invalid %s in Human Resume before confirmation",
    async (kind) => {
      const confirm = vi.fn(confirmDirection);
      const { graph, config, pending } = await pendingDirection(1, confirm);
      const review = pending.directionReview!;
      const action = {
        reviewId: review.id,
        binding: review.binding,
        action: "approve",
        [kind]: "invalid",
      };
      const state = await graph.invoke(new Command({ resume: action }), config);
      expect(state.directionGovernanceResult?.status).toBe("denied");
      expect(confirm).not.toHaveBeenCalled();
    }
  );

  it("revalidates Repository after Human confirmation before issuing approval", async () => {
    const { graph, config, pending } = await pendingDirection(1, (request) => {
      const receipt = confirmDirection(request);
      writeFileSync(join(root, "a.ts"), "changed during Human review");
      return receipt;
    });
    const review = pending.directionReview!;
    const state = await graph.invoke(
      new Command({
        resume: {
          reviewId: review.id,
          binding: review.binding,
          action: "approve",
        },
      }),
      config
    );
    expect(state.directionGovernanceResult?.status).toBe("denied");
  });

  it("binds actual Human confirmation to the exact action and consumes it once", async () => {
    const { pending } = await pendingDirection(1);
    const review = pending.directionReview!;
    const approve = {
      reviewId: review.id,
      binding: review.binding,
      action: "approve" as const,
    };
    const receipt = confirmDirection(
      governance.prepareDirectionConfirmation(approve)
    )!;
    expect(
      governance.finalizeDirectionReview(
        { ...approve, action: "reject" },
        receipt
      ).status
    ).toBe("denied");
    expect(governance.finalizeDirectionReview(approve, receipt).status).toBe(
      "denied"
    );
  });

  it("allows at most two Synthesis-only revisions with fresh bindings and original analysis", async () => {
    const { graph, config, pending, command } = await pendingDirection(
      2,
      confirmDirection
    );
    let review = pending.directionReview!;
    const bindings = [review.binding];
    for (let index = 0; index < 2; index++) {
      const state = await graph.invoke(
        new Command({
          resume: {
            reviewId: review.id,
            binding: review.binding,
            action: "request-revision",
            feedback: "Clarify the reversible direction",
          },
        }),
        config
      );
      expect(state.directionReview?.revision).toBe(index + 1);
      expect(state.directionReview?.previousReviewId).toBe(review.id);
      expect(state.directionReview).not.toHaveProperty("context");
      expect(state.directionReview?.binding).not.toBe(review.binding);
      expect(state.directionGovernanceResult).toBeUndefined();
      expect(
        (await graph.getState(config)).tasks.some(
          (task) => task.interrupts.length === 1
        )
      ).toBe(true);
      review = state.directionReview!;
      bindings.push(review.binding);
    }
    expect(new Set(bindings).size).toBe(3);
    const prompts = command.mock.calls.map((call) => call[1].at(-1)!);
    expect(
      prompts.filter((prompt) => prompt.includes("SpecialistContext:\n"))
    ).toHaveLength(2);
    expect(
      prompts.filter((prompt) => prompt.includes("ComparisonContext:\n"))
    ).toHaveLength(1);
    const contexts = prompts
      .filter((prompt) => prompt.includes("SynthesisContext:\n"))
      .map((prompt) => JSON.parse(prompt.split("SynthesisContext:\n")[1]));
    expect(contexts).toHaveLength(3);
    for (const context of contexts.slice(1)) {
      expect(context.goal).toEqual(contexts[0].goal);
      expect(context.decisions).toEqual(contexts[0].decisions);
      expect(context.comparison).toEqual(contexts[0].comparison);
      expect(context.revision.feedback).toBe(
        "Clarify the reversible direction"
      );
    }
    expect(reservations()).toHaveLength(2);
    expect(() =>
      governance.prepareDirectionConfirmation({
        reviewId: review.id,
        binding: review.binding,
        action: "request-revision",
        feedback: "again",
      })
    ).toThrow();
    const approved = await graph.invoke(
      new Command({
        resume: {
          reviewId: review.id,
          binding: review.binding,
          action: "approve",
        },
      }),
      config
    );
    expect(approved.directionGovernanceResult?.status).toBe("approved");
    if (approved.directionGovernanceResult?.status !== "approved")
      throw new Error("Missing ApprovedDecision");
    const decisionId = approved.directionGovernanceResult.decision.id;
    expect(governance.getApprovedDecision(decisionId).review.revision).toBe(2);
    withGovernanceRecords((raw, persist) => {
      const ledger =
        raw as import("@/application/governance/model/ledger.js").GovernanceLedger;
      Object.values(
        ledger.repositories
      )[0].directionReviews![0].proposal.direction.text =
        "Changed ancestor Proposal";
      persist(ledger);
    });
    expect(() => governance.getApprovedDecision(decisionId)).toThrow("binding");
  });

  it("rejects policy changes made while waiting at the Human interrupt", async () => {
    const { graph, config, pending, command } = await pendingDirection(
      1,
      confirmDirection
    );
    const review = pending.directionReview!;
    const calls = command.mock.calls.length;
    configure(); // New version, even though the policy contents remain compatible.
    const state = await graph.invoke(
      new Command({
        resume: {
          reviewId: review.id,
          binding: review.binding,
          action: "approve",
        },
      }),
      config
    );
    expect(state.directionGovernanceResult?.status).toBe("denied");
    expect(command).toHaveBeenCalledTimes(calls);
  });

  it("keeps Review unresolved when Human confirmation throws", async () => {
    const { graph, config, pending } = await pendingDirection(1, () => {
      throw new Error("terminal unavailable");
    });
    const review = pending.directionReview!;
    const state = await graph.invoke(
      new Command({
        resume: {
          reviewId: review.id,
          binding: review.binding,
          action: "approve",
        },
      }),
      config
    );
    expect(state.directionGovernanceResult?.status).toBe("failed");
    expect(
      governance.getDirectionReview(review.id).review.resolution
    ).toBeUndefined();
  });

  it("rejects a third revision through the Graph without rerunning analysis or Synthesis", async () => {
    const { graph, config, pending, command } = await pendingDirection(
      1,
      confirmDirection
    );
    let review = pending.directionReview!;
    for (let count = 0; count < 2; count++) {
      const result = await graph.invoke(
        new Command({
          resume: {
            reviewId: review.id,
            binding: review.binding,
            action: "request-revision",
            feedback: "Clarify alternatives",
          },
        }),
        config
      );
      review = result.directionReview!;
    }
    const calls = command.mock.calls.length;
    const result = await graph.invoke(
      new Command({
        resume: {
          reviewId: review.id,
          binding: review.binding,
          action: "request-revision",
          feedback: "Again",
        },
      }),
      config
    );
    expect(result.directionGovernanceResult?.status).toBe("denied");
    expect(command).toHaveBeenCalledTimes(calls);
    expect(reservations()).toHaveLength(1);
  });

  it("rejects a Review whose stored Proposal changed after registration", async () => {
    const { pending } = await pendingDirection(1);
    const review = pending.directionReview!;
    withGovernanceRecords((raw, persist) => {
      const ledger =
        raw as import("@/application/governance/model/ledger.js").GovernanceLedger;
      Object.values(
        ledger.repositories
      )[0].directionReviews![0].proposal.direction.text =
        "Unreviewed changed direction";
      persist(ledger);
    });
    expect(
      governance.finalizeDirectionReview({
        reviewId: review.id,
        binding: review.binding,
        action: "approve",
      }).status
    ).toBe("denied");
    expect(() => governance.getDirectionReview(review.id)).toThrow("binding");
  });

  it("keeps one original analysis in the initial Review without per-stage Ledger writes", async () => {
    const { pending } = await pendingDirection(2);
    withGovernanceRecords((raw) => {
      const entry = Object.values(
        (
          raw as import("@/application/governance/model/ledger.js").GovernanceLedger
        ).repositories
      )[0];
      expect(entry.directionAnalyses).toBeUndefined();
      const review = entry.directionReviews![0];
      expect(review.context?.decisions).toEqual(pending.collectedDecisions);
      expect(review.context?.comparison).toEqual(
        pending.decisionComparisonResult
      );
      expect(review.context?.goal).toEqual(options.goal);
    });
    expect(governance).not.toHaveProperty("registerDirectionReview");
    expect(governance).not.toHaveProperty("recordDirectionDecision");
    expect(governance).not.toHaveProperty("recordDirectionComparison");
  });

  it("does not reuse a prior Human Review when invoking fresh input on the same thread", async () => {
    const { graph, config, pending } = await pendingDirection(
      1,
      confirmDirection
    );
    const review = pending.directionReview!;
    const approved = await graph.invoke(
      new Command({
        resume: {
          reviewId: review.id,
          binding: review.binding,
          action: "approve",
        },
      }),
      config
    );
    const next = await graph.invoke(
      { ...approved, goal: options.goal, repositoryPath: root },
      config
    );
    expect(next.directionReview?.id).not.toBe(review.id);
    expect(next.directionReview?.revision).toBe(0);
    expect(next.directionGovernanceResult).toBeUndefined();
    expect(next.directionAction).toBeUndefined();
    expect(reservations()).toHaveLength(2);
  });

  it("preserves Stage 5 proposal when trusted Review registration fails", async () => {
    configure();
    delegate();
    runtime();
    // A real policy change after Synthesis must prevent registration, while
    // preserving the valid Stage 5 result independently of Governance failure.
    const application = await import("@/application/synthesis/index.js");
    const originalRun = application.runSynthesis;
    vi.spyOn(application, "runSynthesis").mockImplementation(
      async (...args) => {
        const result = await originalRun(...args);
        configure();
        return result;
      }
    );
    const graph = createPhaseAGraph({
      ...options,
      executionTarget: "independent-direction-review",
    });
    const state = await graph.invoke(
      { goal: options.goal, repositoryPath: root },
      { configurable: { thread_id: "registration-failed" } }
    );
    expect(state.synthesisResult?.status).toBe("proposed");
    expect(state.directionGovernanceResult?.status).toBe("failed");
    expect(state.directionReview).toBeUndefined();
  });

  it("does not prepare Human Review after Comparison Reference validation fails", async () => {
    prepareBatch();
    runtime("comparison");
    const graph = createPhaseAGraph({
      ...options,
      executionTarget: "independent-direction-review",
    });
    const state = await graph.invoke(
      { goal: options.goal, repositoryPath: root },
      { configurable: { thread_id: "comparison-failed" } }
    );
    expect(state.specialistDecisionsResult?.status).toBe("completed");
    expect(state.decisionComparisonResult?.status).toBe("failed");
    expect(state.synthesisResult).toBeUndefined();
    expect(state.directionReview).toBeUndefined();
  });
  it("refuses a changed Review Binding independently of Proposal data", async () => {
    const { pending } = await pendingDirection(1);
    const review = pending.directionReview!;
    expect(() =>
      governance.prepareDirectionConfirmation({
        reviewId: review.id,
        binding: review.binding + "changed",
        action: "approve",
      })
    ).toThrow();
  });

  it.each(["schema", "references", "coverage"] as const)(
    "never registers or approves a %s-invalid CEO Proposal, even with forged incoming State",
    async (failure) => {
      prepareBatch();
      runtime();
      const confirm = vi.fn(confirmDirection);
      const invalid = {
        direction: {
          text: "Unvalidated direction",
          sources: [
            { kind: "recommendation" as const, specialistId: "frontend" },
          ],
        },
        rationale: [
          {
            text: "Original reason",
            sources: [
              { kind: "recommendation" as const, specialistId: "frontend" },
            ],
          },
        ],
        alternatives: [],
        tradeoffs: [],
        risks: [],
        unresolvedIssues: [],
        humanReviewItems: [
          {
            text: "Review",
            sources: [
              { kind: "recommendation" as const, specialistId: "frontend" },
            ],
          },
        ],
      };
      const graph = createPhaseAGraph({
        ...options,
        executionTarget: "independent-direction-review",
        confirmDirection: confirm,
        synthesis: {
          agent: async () =>
            failure === "schema"
              ? ({
                  type: "propose",
                  proposal: { direction: "Invalid" },
                } as unknown as import("@/application/synthesis/index.js").CEOSynthesisDecision)
              : {
                  type: "propose",
                  proposal:
                    failure === "references"
                      ? {
                          ...invalid,
                          direction: {
                            ...invalid.direction,
                            sources: [
                              {
                                kind: "recommendation",
                                specialistId: "unknown",
                              },
                            ],
                          },
                        }
                      : invalid,
                },
        },
      });
      const state = await graph.invoke(
        {
          goal: options.goal,
          repositoryPath: root,
          synthesisResult: { status: "proposed", proposal: invalid },
          directionReview: {
            id: "forged",
            scopeId: "forged",
            scopeVersion: 1,
            analysisDigest: "forged",
            revision: 0,
            binding: "forged",
            proposal: invalid,
          },
          directionGovernanceResult: {
            status: "approved",
            decision: {
              id: "forged",
              reviewId: "forged",
              reviewBinding: "forged",
              approvalRecordId: "forged",
            },
          },
        },
        { configurable: { thread_id: "invalid-proposal" } }
      );
      expect(state.synthesisResult).toMatchObject({
        status: "failed",
        failure:
          failure === "schema"
            ? "invalid-output"
            : failure === "references"
              ? "invalid-references"
              : "incomplete-coverage",
      });
      expect(state.directionReview).toBeUndefined();
      expect(state.directionGovernanceResult).toBeUndefined();
      expect(confirm).not.toHaveBeenCalled();
      withGovernanceRecords((raw) => {
        const entry = Object.values(
          (
            raw as import("@/application/governance/model/ledger.js").GovernanceLedger
          ).repositories
        )[0];
        expect(entry.directionReviews).toBeUndefined();
        expect(entry.approvedDecisions).toBeUndefined();
      });
    }
  );

  it("reads and approves legacy per-stage Ledger history without migrating it", async () => {
    const { pending } = await pendingDirection(2);
    const reviewId = pending.directionReview!.id;
    withGovernanceRecords((raw, persist) => {
      const entry = Object.values(
        (
          raw as import("@/application/governance/model/ledger.js").GovernanceLedger
        ).repositories
      )[0];
      const review = entry.directionReviews![0];
      const context = review.context!;
      const scope = entry.issuances.find(
        (value) => value.scope.id === review.scopeId
      )!.scope;
      entry.directionAnalyses = [
        {
          scopeId: scope.id,
          scopeVersion: scope.version,
          decisions: scope.assignments.map((assignment, index) => ({
            assignmentId: assignment.assignmentId,
            invocationId: entry.reservations!.find(
              (value) => value.assignmentId === assignment.assignmentId
            )!.invocationId,
            decision: context.decisions[index],
          })),
          comparison: context.comparison,
        },
      ];
      delete review.context;
      const { binding: _binding, resolution: _resolution, ...subject } = review;
      review.binding = governanceDigest(subject);
      persist(raw);
    });
    const before = withGovernanceRecords((raw) => structuredClone(raw));
    const restored = governance.getDirectionReview(reviewId);
    expect(restored.context.decisions).toEqual(pending.collectedDecisions);
    expect(withGovernanceRecords((raw) => raw)).toEqual(before);
    const action = {
      reviewId,
      binding: restored.review.binding,
      action: "approve" as const,
    };
    const receipt = confirmDirection(
      governance.prepareDirectionConfirmation(action)
    );
    const approved = governance.finalizeDirectionReview(action, receipt!);
    expect(approved.status).toBe("approved");
    if (approved.status !== "approved") throw new Error("Missing approval");
    configure();
    expect(
      governance.getApprovedDecision(approved.decision.id).context
    ).toEqual(restored.context);
    withGovernanceRecords((raw) => {
      const entry = Object.values(
        (
          raw as import("@/application/governance/model/ledger.js").GovernanceLedger
        ).repositories
      )[0];
      expect(entry.directionReviews![0]).not.toHaveProperty("context");
      expect(entry.directionAnalyses).toHaveLength(1);
    });
  });

  it.each([1, 2])(
    "connects real Governance, v2/v3 and Synthesis for %i Assignments",
    async (count) => {
      if (count === 2) prepareBatch();
      else {
        configure();
        delegate();
      }
      const command = runtime();
      const state = await createPhaseAGraph({
        ...options,
        executionTarget: "ceo-synthesis",
      }).invoke({ goal: options.goal, repositoryPath: root });
      expect(state.synthesisResult?.status).toBe("proposed");
      expect(state.specialistDecisionsResult?.status).toBe("completed");
      expect(state.decisionComparisonResult?.status).toBe(
        count === 1 ? "skipped" : "completed"
      );
      const prompts = command.mock.calls.map((call) => call[1].at(-1)!);
      const synthesisPrompts = prompts.filter((prompt) =>
        prompt.includes("SynthesisContext:\n")
      );
      expect(synthesisPrompts).toHaveLength(1);
      const context = JSON.parse(
        synthesisPrompts[0].split("SynthesisContext:\n")[1]
      );
      expect(context.goal).toEqual(options.goal);
      expect(context.repositoryCommitSha).toBe(
        state.specialistComparisonContext?.repositoryCommitSha
      );
      expect(context.assignments).toEqual(state.synthesisAssignments);
      expect(context.decisions).toEqual(state.collectedDecisions);
      expect(context.comparison).toEqual(state.decisionComparisonResult);
      expect(context).not.toHaveProperty("scope");
      expect(context).not.toHaveProperty("approval");
      expect(prompts.at(-1)).toBe(synthesisPrompts[0]);
      expect(command).toHaveBeenCalledTimes(count === 1 ? 2 : 4);
      expect(reservations()).toHaveLength(count);
      expect(reservations().every((r) => r.claimedAt !== undefined)).toBe(true);
      expect(issuanceCount()).toBe(1);
    }
  );
  it("runs approved dynamic Assignments in order and passes original Goal/SHA/Decisions to v3", async () => {
    prepareBatch();
    const command = runtime();
    const authorize = vi.spyOn(governance, "authorizeSpecialistInvocation");
    const state = await createPhaseAGraph({
      ...options,
      executionTarget: "specialist-decisions",
    }).invoke({ goal: options.goal, repositoryPath: root });
    const result = state.specialistDecisionsResult;
    const approval = state.approvalResult;
    if (!result || approval?.status !== "approved")
      throw new Error("Missing Graph results");
    const scope = approval.scope;
    expect(state.goal).toEqual(options.goal);
    expect(scope.goal).toEqual(options.goal);
    expect(options.agent).toHaveBeenCalledTimes(1);
    expect(issuanceCount()).toBe(1);
    expect(authorize).toHaveBeenCalledTimes(2);
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
    expect(state.decisionComparisonResult?.status).toBe("completed");
    if (state.decisionComparisonResult?.status !== "completed")
      throw new Error("Expected Comparison");
    expect(
      state.decisionComparisonResult.comparison.gaps[0].specialistIds
    ).toEqual(["frontend", "ux"]);
    expect(reservations()).toHaveLength(2);
    expect(
      reservations().every(({ claimedAt }) => claimedAt !== undefined)
    ).toBe(true);
  });
  it("does not reserve anything if a later request fails preflight", async () => {
    prepareBatch();
    const lookup = governance.getApprovedStaffingScope;
    vi.spyOn(governance, "getApprovedStaffingScope").mockImplementation(
      (id) => {
        const result = lookup(id);
        if (result.status !== "approved") return result;
        const copy = structuredClone(result);
        copy.scope.assignments[1] = structuredClone(copy.scope.assignments[0]);
        return copy;
      }
    );
    const command = runtime();
    const state = await createPhaseAGraph({
      ...options,
      executionTarget: "specialist-decisions",
    }).invoke({ goal: options.goal, repositoryPath: root });
    if (state.approvalResult?.status !== "approved")
      throw new Error("Missing Scope");
    expect(state.specialistDecisionsResult).toMatchObject({
      status: "failed",
      stage: "preflight",
      assignmentId: state.approvalResult.scope.assignments[0].assignmentId,
    });
    expect(reservations()).toHaveLength(0);
    expect(command).not.toHaveBeenCalled();
  });
  it("rechecks Governance after preflight lookup and before the first Reservation", async () => {
    prepareBatch();
    const lookup = governance.getApprovedStaffingScope;
    const queried = vi
      .spyOn(governance, "getApprovedStaffingScope")
      .mockImplementation((id) => {
        const result = lookup(id);
        configure(); // Policy changes after the trusted read, before Authorization.
        return result;
      });
    const command = runtime();
    const state = await createPhaseAGraph({
      ...options,
      executionTarget: "specialist-decisions",
    }).invoke({ goal: options.goal, repositoryPath: root });
    expect(queried).toHaveBeenCalledTimes(1);
    expect(state.specialistDecisionsResult).toMatchObject({
      status: "failed",
      stage: "authorization",
    });
    expect(state.decisionComparisonResult).toBeUndefined();
    expect(reservations()).toHaveLength(0);
    expect(command).not.toHaveBeenCalled();
  });
  it("leaves individual Context authorization to Governance", async () => {
    prepareBatch();
    const lookup = governance.getApprovedStaffingScope;
    vi.spyOn(governance, "getApprovedStaffingScope").mockImplementation(
      (id) => {
        const result = lookup(id);
        if (result.status !== "approved") return result;
        const copy = structuredClone(result);
        copy.scope.assignments[0].contextPaths = ["unapproved.ts"];
        return copy;
      }
    );
    const command = runtime();
    const state = await createPhaseAGraph({
      ...options,
      executionTarget: "specialist-decisions",
    }).invoke({ goal: options.goal, repositoryPath: root });
    if (state.approvalResult?.status !== "approved")
      throw new Error("Missing Scope");
    expect(state.specialistDecisionsResult).toMatchObject({
      status: "failed",
      stage: "authorization",
      assignmentId: state.approvalResult.scope.assignments[0].assignmentId,
    });
    expect(reservations()).toHaveLength(0);
    expect(command).not.toHaveBeenCalled();
  });
  it("stops after budget denial without executing or comparing remaining work", async () => {
    prepareBatch(1);
    const command = runtime();
    const state = await createPhaseAGraph({
      ...options,
      executionTarget: "specialist-decisions",
    }).invoke({ goal: options.goal, repositoryPath: root });
    if (state.approvalResult?.status !== "approved")
      throw new Error("Missing Scope");
    expect(state.specialistDecisionsResult).toMatchObject({
      status: "failed",
      stage: "authorization",
      assignmentId: state.approvalResult.scope.assignments[1].assignmentId,
    });
    expect(reservations()).toHaveLength(1);
    expect(command).toHaveBeenCalledTimes(1);
  });
  it("reports an opaque Claim denial without executing Codex or reserving the next Assignment", async () => {
    prepareBatch();
    const authorize = vi.spyOn(governance, "authorizeSpecialistInvocation");
    vi.spyOn(governance, "claimAuthorizedInvocation").mockReturnValueOnce({
      status: "denied",
      reason: "Invocation claim denied",
    });
    const command = runtime();
    const state = await createPhaseAGraph({
      ...options,
      executionTarget: "specialist-decisions",
    }).invoke({ goal: options.goal, repositoryPath: root });
    if (state.approvalResult?.status !== "approved")
      throw new Error("Missing Scope");
    expect(state.specialistDecisionsResult).toEqual({
      status: "failed",
      stage: "claim",
      reason: "Invocation claim denied",
      assignmentId: state.approvalResult.scope.assignments[0].assignmentId,
    });
    expect(reservations()).toHaveLength(1);
    expect(reservations()[0]).not.toHaveProperty("claimedAt");
    expect(command).not.toHaveBeenCalled();
    expect(state.goal).toEqual(options.goal);
    expect(options.agent).toHaveBeenCalledTimes(1);
    expect(issuanceCount()).toBe(1);
    expect(authorize).toHaveBeenCalledTimes(1);
    expect(state.specialistDecisionsResult).not.toHaveProperty("decisions");
    expect(state.decisionComparisonResult).toBeUndefined();
  });
  it("retains the Claim and stops remaining work on v2 Evidence failure", async () => {
    prepareBatch();
    const authorize = vi.spyOn(governance, "authorizeSpecialistInvocation");
    const command = runtime("decision");
    const state = await createPhaseAGraph({
      ...options,
      executionTarget: "specialist-decisions",
    }).invoke({ goal: options.goal, repositoryPath: root });
    if (state.approvalResult?.status !== "approved")
      throw new Error("Missing Scope");
    expect(state.specialistDecisionsResult).toMatchObject({
      status: "failed",
      stage: "decision",
      assignmentId: state.approvalResult.scope.assignments[0].assignmentId,
    });
    expect(reservations()).toHaveLength(1);
    expect(reservations()[0].claimedAt).toEqual(expect.any(String));
    expect(command).toHaveBeenCalledTimes(1);
    expect(state.goal).toEqual(options.goal);
    expect(options.agent).toHaveBeenCalledTimes(1);
    expect(issuanceCount()).toBe(1);
    expect(authorize).toHaveBeenCalledTimes(1);
    expect(state.specialistDecisionsResult).not.toHaveProperty("decisions");
    expect(state.decisionComparisonResult).toBeUndefined();
  });
  it("reports v3 Reference Validation failure separately after all Decisions succeed", async () => {
    prepareBatch();
    const authorize = vi.spyOn(governance, "authorizeSpecialistInvocation");
    const command = runtime("comparison");
    const state = await createPhaseAGraph({
      ...options,
      executionTarget: "specialist-decisions",
    }).invoke({ goal: options.goal, repositoryPath: root });
    const result = state.specialistDecisionsResult;
    expect(state.approvalResult?.status).toBe("approved");
    expect(result).toEqual({
      status: "completed",
      decisions: state.collectedDecisions,
    });
    expect(state.collectedDecisions).toHaveLength(2);
    expect(result).not.toHaveProperty("comparison");
    expect(state.decisionComparisonResult).toMatchObject({
      status: "failed",
      reason: expect.any(String),
    });
    expect(command).toHaveBeenCalledTimes(3);
    expect(reservations()).toHaveLength(2);
    expect(
      reservations().every(({ claimedAt }) => claimedAt !== undefined)
    ).toBe(true);
    expect(state.goal).toEqual(options.goal);
    expect(options.agent).toHaveBeenCalledTimes(1);
    expect(issuanceCount()).toBe(1);
    expect(authorize).toHaveBeenCalledTimes(2);
  });

  it("rechecks current Governance policy before authorizing the next Assignment", async () => {
    prepareBatch();
    const command = runtime();
    const simulate = command.getMockImplementation()!;
    let calls = 0;
    command.mockImplementation(async (...args) => {
      const result = await simulate(...args);
      if (++calls === 1) configure(); // New policy version invalidates the issued Scope.
      return result;
    });
    const state = await createPhaseAGraph({
      ...options,
      executionTarget: "specialist-decisions",
    }).invoke({ goal: options.goal, repositoryPath: root });
    if (state.approvalResult?.status !== "approved")
      throw new Error("Missing Scope");
    expect(state.specialistDecisionsResult).toMatchObject({
      status: "failed",
      stage: "authorization",
      assignmentId: state.approvalResult.scope.assignments[1].assignmentId,
    });
    expect(command).toHaveBeenCalledTimes(1);
    expect(reservations()).toHaveLength(1);
    expect(reservations()[0].claimedAt).toEqual(expect.any(String));
    expect(state.collectedDecisions).toEqual([]);
    expect(state.decisionComparisonResult).toBeUndefined();
  });
  it("does not reuse prior Claim or Decisions when the Graph is invoked again", async () => {
    prepareBatch();
    const command = runtime();
    const authorize = vi.spyOn(governance, "authorizeSpecialistInvocation");
    const claim = vi.spyOn(governance, "claimAuthorizedInvocation");
    const graph = createPhaseAGraph({
      ...options,
      executionTarget: "specialist-decisions",
    });
    const first = await graph.invoke({
      goal: options.goal,
      repositoryPath: root,
    });
    expect(first.specialistDecisionsResult?.status).toBe("completed");
    expect(first.decisionComparisonResult?.status).toBe("completed");
    const second = await graph.invoke(first);
    expect(second.specialistDecisionsResult?.status).toBe("completed");
    expect(second.decisionComparisonResult?.status).toBe("completed");
    expect(options.agent).toHaveBeenCalledTimes(2);
    expect(authorize).toHaveBeenCalledTimes(4);
    expect(claim).toHaveBeenCalledTimes(4);
    expect(command).toHaveBeenCalledTimes(6);
    expect(reservations()).toHaveLength(4);
    expect(new Set(reservations().map((r) => r.invocationId)).size).toBe(4);
    expect(second.currentSpecialistIndex).toBe(2);
    expect(second.collectedDecisions).toHaveLength(2);
  });

  it.each(["single", "authorization"] as const)(
    "connects the real Specialist Workflow through Phase A: %s",
    async (mode) => {
      if (mode === "single") {
        configure();
        delegate();
      } else {
        prepareBatch();
        vi.spyOn(
          governance,
          "authorizeSpecialistInvocation"
        ).mockReturnValueOnce({
          status: "denied",
          reason: "Authorization stopped",
        });
      }
      const command = runtime();
      const authorize = vi.spyOn(governance, "authorizeSpecialistInvocation");
      const state = await createPhaseAGraph({
        ...options,
        executionTarget: "specialist-decisions",
      }).invoke({ goal: options.goal, repositoryPath: root });
      expect(state.approvalResult?.status).toBe("approved");
      expect(options.agent).toHaveBeenCalledTimes(1);
      expect(issuanceCount()).toBe(1);
      expect(state.goal).toEqual(options.goal);
      expect(authorize).toHaveBeenCalledTimes(1);
      const result = state.specialistDecisionsResult;
      if (mode === "single") {
        expect(result?.status).toBe("completed");
        if (result?.status !== "completed")
          throw new Error(JSON.stringify(result));
        const approval = state.approvalResult;
        if (approval?.status !== "approved") throw new Error("Expected Scope");
        const scope = approval.scope;
        expect(
          result.decisions.map((d) => ({
            id: d.specialistId,
            objective: d.recommendation,
            path: d.evidence[0].path,
          }))
        ).toEqual(
          scope.assignments.map((a) => ({
            id: a.specialistId,
            objective: a.objective,
            path: a.contextPaths[0],
          }))
        );
        const context = JSON.parse(
          command.mock.calls[0][1].at(-1)!.split("SpecialistContext:\n")[1]
        );
        expect(context.goal).toEqual(options.goal);
        expect(context.repositoryCommitSha).toBe(scope.snapshot.commitSha);
        expect(context.assignmentObjective).toBe(
          scope.assignments[0].objective
        );
        expect(result).not.toHaveProperty("comparison");
        expect(state.decisionComparisonResult).toEqual({
          status: "skipped",
          reason: "insufficient-decisions",
        });
        expect(command).toHaveBeenCalledTimes(1);
        expect(reservations()).toHaveLength(1);
        expect(reservations().every((r) => r.claimedAt !== undefined)).toBe(
          true
        );
      } else {
        expect(result).toMatchObject({
          status: "failed",
          stage: "authorization",
        });
        expect(result).toHaveProperty("assignmentId");
        expect(result).not.toHaveProperty("decisions");
        expect(state.decisionComparisonResult).toBeUndefined();
        expect(command).not.toHaveBeenCalled();
        expect(reservations()).toHaveLength(0);
      }
    }
  );
});

describe("Phase A Graph → real Staffing and Governance Approval", () => {
  it("projects delegated assignment constraints while keeping System Policy discovery", async () => {
    mkdirSync(join(root, "src"));
    writeFileSync(join(root, "src", "a.ts"), "export const a = 1;\n");
    writeFileSync(join(root, "b.ts"), "export const b = 2;\n");
    git("add", ".");
    git("commit", "--quiet", "-m", "Add discovery context");
    system.contextAccessPolicy.allowedScopes.push(
      { kind: "directory", path: "src" },
      { kind: "file", path: "b.ts" }
    );
    system.availableSpecialists.push({
      ...system.availableSpecialists[0],
      id: "ux",
    });
    draft.assignments[0].contextPaths = ["src/a.ts"];
    draft.budget.maxAgentInvocations = 1;
    configure();
    const scopes = [{ kind: "directory" as const, path: "src" }];
    delegate(1, ["frontend"], scopes);
    const agent = vi
      .fn<NonNullable<typeof options.agent>>()
      .mockResolvedValueOnce({
        type: "inspect",
        paths: ["b.ts"],
        reason: "Understand adjacent context",
      })
      .mockResolvedValueOnce({ type: "propose", draft });
    const confirmApproval = vi.fn();
    const state = await createPhaseAGraph({
      ...options,
      agent,
      confirmApproval,
    }).invoke({
      goal: options.goal,
      repositoryPath: root,
    });
    expect(agent).toHaveBeenCalledTimes(2);
    for (const [context] of agent.mock.calls) {
      expect(context.assignmentConstraints).toEqual({
        allowedSpecialistIds: ["frontend"],
        delegatedContextScopes: scopes,
        maxAgentInvocations: 1,
      });
      expect(context.availableSpecialists.map(({ id }) => id)).toEqual([
        "frontend",
      ]);
      expect(context.repository.fileTree).toContain("b.ts");
    }
    expect(agent.mock.calls[1][0].inspectedFiles).toContainEqual({
      path: "b.ts",
      content: "export const b = 2;\n",
    });
    expect(state.approvalResult).toMatchObject({
      status: "approved",
      approval: { source: { type: "human-delegation" } },
    });
    expect(confirmApproval).not.toHaveBeenCalled();
  });

  it.each([
    "missing",
    "specialist",
    "context",
    "budget",
    "expired",
    "policy-version",
    "snapshot",
  ] as const)(
    "blocks default Specialist execution for %s Staffing authority",
    async (kind) => {
      writeFileSync(join(root, "b.ts"), "export const b = 2;\n");
      git("add", ".");
      git("commit", "--quiet", "-m", "Add alternative context");
      system.contextAccessPolicy.allowedScopes.push({
        kind: "file",
        path: "b.ts",
      });
      system.availableSpecialists.push({
        ...system.availableSpecialists[0],
        id: "ux",
      });
      configure();
      if (kind !== "missing") delegate(kind === "budget" ? 1 : 2);
      if (kind === "specialist") draft.assignments[0].specialistId = "ux";
      if (kind === "context") draft.assignments[0].contextPaths = ["b.ts"];
      if (kind === "expired")
        vi.spyOn(Date, "now").mockReturnValue(Date.now() + 2 * 86_400_000);
      if (kind === "policy-version") configure();
      const agent: NonNullable<typeof options.agent> = async () => {
        if (kind === "snapshot") writeFileSync(join(root, "b.ts"), "Drift\n");
        return { type: "propose", draft };
      };
      const confirmApproval = vi.fn(accept);
      const authorize = vi.spyOn(governance, "authorizeSpecialistInvocation");
      const state = await createPhaseAGraph({
        ...options,
        agent,
        confirmApproval,
        executionTarget: "specialist-decisions",
      }).invoke({ goal: options.goal, repositoryPath: root });
      if (kind === "snapshot")
        expect(state.staffingResult).toMatchObject({
          status: "failed",
          failure: "snapshot-drift",
        });
      else
        expect(state.approvalResult?.status).toBe(
          kind === "expired" || kind === "policy-version"
            ? "denied"
            : "approval-required"
        );
      expect(confirmApproval).not.toHaveBeenCalled();
      expect(state.specialistDecisionsResult).toBeUndefined();
      expect(issuanceCount()).toBe(0);
      expect(authorize).not.toHaveBeenCalled();
    }
  );

  it.each(["delegated", "direct"] as const)(
    "preserves %s Approval semantics without a Human callback",
    async (mode) => {
      configure();
      if (mode === "delegated") delegate();
      const state = await createPhaseAGraph({
        maxRounds: options.maxRounds,
        agent: options.agent,
      }).invoke({ goal: options.goal, repositoryPath: root });
      const outcome = state.approvalResult;
      expect(state.goal).toEqual(options.goal);
      expect(options.agent).toHaveBeenCalledTimes(1);
      if (mode === "delegated") {
        expect(outcome?.status).toBe("approved");
        if (outcome?.status !== "approved")
          throw new Error(JSON.stringify(state));
        expect(outcome.approval.source.type).toBe("human-delegation");
        expect(outcome.scope.proposalId).toBe(outcome.approval.proposalId);
        expect(outcome.scope.goal).toEqual(options.goal);
        expect(getApprovedStaffingScope(outcome.scope.id).status).toBe(
          "approved"
        );
        expect(issuanceCount()).toBe(1);
      } else {
        expect(outcome?.status).toBe("approval-required");
        if (outcome?.status !== "approval-required")
          throw new Error(JSON.stringify(state));
        expect(outcome.subject?.goal).toEqual(options.goal);
        expect(outcome.binding).toEqual(expect.any(String));
        expect(issuanceCount()).toBe(0);
      }
      withGovernanceRecords((raw) => {
        const records = raw as {
          repositories: Record<string, { reservations?: unknown[] }>;
        };
        expect(
          Object.values(records.repositories)[0].reservations ?? []
        ).toHaveLength(0);
      });
    }
  );

  it("uses current Governance validation when policy changes during CEO execution", async () => {
    configure();
    delegate();
    const agent = vi.fn(async () => {
      configureHumanDelegation(
        root,
        null,
        accept(configureHumanDelegation(root, null))
      );
      return { type: "propose" as const, draft };
    });
    const state = await createPhaseAGraph({ maxRounds: 1, agent }).invoke({
      goal: options.goal,
      repositoryPath: root,
    });
    expect(state.approvalResult?.status).toBe("denied");
    expect(agent).toHaveBeenCalledTimes(1);
    expect(issuanceCount()).toBe(0);
  });
});

it("finalizes direct Human approval and retains Phase A stage results", async () => {
  configure();
  const confirmApproval = vi.fn((request: Parameters<typeof accept>[0]) =>
    accept(request)
  );
  const state = await createPhaseAGraph({
    ...options,
    confirmApproval,
    allowDirectStaffingApproval: true,
  }).invoke({ goal: options.goal, repositoryPath: root });
  expect(state.approvalResult?.status).toBe("approved");
  expect(Object.keys(state).sort()).toEqual([
    "analysisAssessment",
    "analysisBatchInvocationIds",
    "analysisRefinement",
    "analysisRepresentatives",
    "approvalResult",
    "collectedDecisions",
    "currentSpecialistIndex",
    "decisionComparisonResult",
    "directionAction",
    "directionGovernanceResult",
    "directionReview",
    "goal",
    "phaseACompletion",
    "policyLookup",
    "preparedSpecialistRequests",
    "repositoryPath",
    "specialistComparisonContext",
    "specialistDecisionsResult",
    "staffingResult",
    "synthesisAssignments",
    "synthesisResult",
  ]);
  expect(options.agent).toHaveBeenCalledTimes(1);
  expect(confirmApproval).toHaveBeenCalledTimes(1);
  expect(issuanceCount()).toBe(1);
});

describe("Graph approval concurrency boundary", () => {
  it("does not issue a second Scope if the reviewed Proposal was approved during the Human wait", async () => {
    configure();
    options.confirmApproval = (request) => {
      const receipt = accept(request);
      expect(request.subject).not.toBeNull();
      const proposal =
        request.subject as import("@/application/staffing/index.js").StaffingProposal;
      expect(governance.approveStaffingProposal(proposal, receipt).status).toBe(
        "approved"
      );
      return receipt;
    };
    const result = await runStaffingApproval(options);
    expect(result.status).toBe("denied");
    expect(options.agent).toHaveBeenCalledTimes(1);
    expect(issuanceCount()).toBe(1);
  });
});

describe("CLI through current Phase A Staffing Approval", () => {
  it("executes the real Phase A Graph and finalizes terminal confirmation once", async () => {
    configure();
    const executeStaffing = staffingApplication.runStaffing;
    vi.spyOn(staffingApplication, "runStaffing").mockImplementation((input) =>
      executeStaffing({ ...input, agent: options.agent })
    );
    const createGraph = vi.spyOn(phaseAGraph, "createPhaseAGraph");
    const specialistProcess = vi
      .spyOn(processRuntime, "runCommand")
      .mockRejectedValue(new Error("Unexpected Specialist execution"));
    const scopeLookup = vi.spyOn(governance, "getApprovedStaffingScope");
    const output = vi.spyOn(console, "log").mockImplementation(() => {});
    writeFileSync(join(home, "goal.json"), JSON.stringify(options.goal));
    expect(await runStaffingCli([root, join(home, "goal.json")])).toBe(0);
    expect(createGraph).toHaveBeenCalledExactlyOnceWith(
      expect.objectContaining({ executionTarget: "staffing-approval" })
    );
    expect(specialistProcess).not.toHaveBeenCalled();
    expect(scopeLookup).not.toHaveBeenCalled();
    expect(options.agent).toHaveBeenCalledTimes(1);
    const result = JSON.parse(output.mock.calls[0][0]);
    expect(result.status).toBe("approved");
    expect(result.approval.source.type).toBe("direct-human");
    expect(result.scope.goal).toEqual(options.goal);
    expect(issuanceCount()).toBe(1);
  });
});
