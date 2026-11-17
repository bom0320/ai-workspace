import * as staffingApplication from "@/application/staffing/index.js";
import * as phaseAGraph from "../graph.js";
import { runStaffingCli } from "@/cli/commands/staffing/staffing.js";
import * as governance from "@/application/governance/index.js";
import * as processRuntime from "@/infrastructure/process/index.js";
import {
  createPhaseAGraph,
  runAuthorizedSpecialistDecision,
} from "../index.js";
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
} from "../entrypoints/run-staffing-approval.js";

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
  function prepareBatch(budget = 2) {
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
  }
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
        options.confirmApproval = (request) => accept(request);
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
  const state = await createPhaseAGraph({ ...options, confirmApproval }).invoke(
    { goal: options.goal, repositoryPath: root }
  );
  expect(state.approvalResult?.status).toBe("approved");
  expect(Object.keys(state).sort()).toEqual([
    "approvalResult",
    "collectedDecisions",
    "currentSpecialistIndex",
    "decisionComparisonResult",
    "goal",
    "policyLookup",
    "preparedSpecialistRequests",
    "repositoryPath",
    "specialistComparisonContext",
    "specialistDecisionsResult",
    "staffingResult",
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
