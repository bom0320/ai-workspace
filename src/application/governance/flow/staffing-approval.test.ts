import { execFileSync } from "node:child_process";
import {
  chmodSync,
  mkdtempSync,
  mkdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
  symlinkSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  confirmHumanAction,
  type HumanConfirmation,
} from "@/infrastructure/terminal/index.js";
import {
  governanceDigest,
  withGovernanceRecords,
} from "@/services/governance-records/index.js";
import {
  runStaffing,
  type StaffingProposal,
} from "@/application/staffing/index.js";
import {
  approveStaffingProposal,
  configureHumanDelegation,
  configureStaffingSystemPolicy,
  getApprovedStaffingScope,
  approvedOperatingScopeSchema,
  approvalRecordSchema,
  type StaffingApprovalResult,
  type StaffingSystemPolicy,
  type HumanDelegationPolicyInput,
} from "../index.js";

const terminal = vi.hoisted(() => ({
  home: "",
  line: "",
  offset: 0,
  answer: "approve",
  prompts: 0,
  available: true,
}));
vi.mock("node:os", async (original) => ({
  ...(await original<typeof import("node:os")>()),
  homedir: () => terminal.home,
}));
vi.mock("node:tty", () => ({
  isatty: (fd: number) => fd === 999 && terminal.available,
}));
vi.mock("node:fs", async (original) => {
  const actual = await original<typeof import("node:fs")>();
  return {
    ...actual,
    openSync: (path: string, flags: string | number, mode?: number) =>
      path === "/dev/tty" ? 999 : actual.openSync(path, flags, mode),
    closeSync: (fd: number) => {
      if (fd !== 999) actual.closeSync(fd);
    },
    writeSync: (fd: number, text: string) => {
      if (fd !== 999) return actual.writeSync(fd, text);
      terminal.prompts += 1;
      terminal.offset = 0;
      const token = /Type Approve ([a-f0-9-]+)/.exec(text)![1];
      terminal.line =
        terminal.answer === "approve"
          ? `Approve ${token}\n`
          : terminal.answer === "approve-eof"
            ? `Approve ${token}`
            : terminal.answer;
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
let delegation: HumanDelegationPolicyInput;
let proposal: StaffingProposal;
const git = (...args: string[]) =>
  execFileSync("git", args, {
    cwd: root,
    encoding: "utf8",
    stdio: "pipe",
  }).trim();
function accept(request: StaffingApprovalResult): HumanConfirmation {
  if (request.status !== "approval-required")
    throw new Error(JSON.stringify(request));
  const receipt = confirmHumanAction(request.binding, request.reason);
  if (!receipt) throw new Error("Expected trusted terminal confirmation");
  return receipt;
}
function delegate() {
  const request = configureHumanDelegation(root, delegation);
  expect(
    configureHumanDelegation(root, delegation, accept(request)).status
  ).toBe("configured");
}
beforeEach(async () => {
  home = mkdtempSync(join(tmpdir(), "ai-workspace-gov-home-"));
  terminal.home = home;
  terminal.answer = "approve";
  terminal.prompts = 0;
  terminal.available = true;
  root = mkdtempSync(join(tmpdir(), "ai-workspace-gov-repo-"));
  git("init", "--quiet");
  git("config", "user.name", "Test");
  git("config", "user.email", "test@example.com");
  writeFileSync(join(root, "a.ts"), "export const a = 1;\n");
  writeFileSync(join(root, "b.ts"), "export const b = 1;\n");
  git("add", ".");
  git("commit", "--quiet", "-m", "initial");
  system = {
    repositoryRoot: root,
    phase: "phase-a",
    availableSpecialists: [
      {
        id: "frontend",
        role: "Frontend",
        objective: "Review",
        authority: { repositoryAccess: "read", shellExecution: false },
      },
      {
        id: "ux",
        role: "UX",
        objective: "Review usability",
        authority: { repositoryAccess: "read", shellExecution: false },
      },
    ],
    allowedContextPaths: ["a.ts", "b.ts"],
    limits: {
      maxFilesPerRequest: 2,
      maxTotalFiles: 2,
      maxFileBytes: 65536,
      maxContextBytes: 131072,
      maxFileTreeEntries: 10,
    },
    policy: { maxAgentInvocations: 4, enforcementRules: [] },
  };
  delegation = {
    phase: "phase-a",
    allowedSpecialistIds: ["frontend"],
    allowedContextPaths: ["a.ts"],
    repositoryAccess: "read",
    shellExecution: false,
    maxAgentInvocations: 2,
    expiresAt: new Date(Date.now() + 86400000).toISOString(),
  };
  const result = await runStaffing({
    goal: {
      objective: "Review behavior",
      targetRepository: "example",
      constraints: ["Preserve all accessibility requirements"],
    },
    repositoryPath: root,
    availableSpecialists: system.availableSpecialists,
    allowedContextPaths: system.allowedContextPaths,
    limits: system.limits,
    policy: system.policy,
    maxRounds: 1,
    agent: async () => ({
      type: "propose",
      draft: {
        intent: {
          problem: "Behavior",
          desiredOutcome: "Review",
          considerations: [],
          uncertainties: [],
        },
        assignments: [
          {
            specialistId: "frontend",
            objective: "Review behavior",
            contextPaths: ["a.ts"],
            rationale: "Frontend",
          },
        ],
        budget: { maxAgentInvocations: 2 },
        rationale: "Analysis",
      },
    }),
  });
  if (result.status !== "proposed") throw new Error("Fixture staffing failed");
  proposal = result.proposal;
  const request = configureStaffingSystemPolicy(system);
  expect(configureStaffingSystemPolicy(system, accept(request)).status).toBe(
    "configured"
  );
});
afterEach(() => {
  vi.restoreAllMocks();
  rmSync(root, { recursive: true, force: true });
  rmSync(home, { recursive: true, force: true });
});

describe("Human Staffing Approval and delegation — no Specialist execution", () => {
  it("reuses Human-approved delegation across Goals without further input and persists verifiable source/Scope links", () => {
    delegate();
    const prompts = terminal.prompts;
    const first = approveStaffingProposal(proposal);
    expect(first.status).toBe("approved");
    if (first.status !== "approved") throw new Error("Expected Scope");
    expect(approvalRecordSchema.parse(first.approval)).toEqual(first.approval);
    expect(approvedOperatingScopeSchema.parse(first.scope)).toEqual(
      first.scope
    );
    expect(first.approval.source.type).toBe("human-delegation");
    expect(first.approval.proposalDigest).toBe(governanceDigest(proposal));
    expect(first.scope.approvalRecordId).toBe(first.approval.id);
    expect(first.scope.goal).toEqual(proposal.goal);
    expect(first.scope.snapshot).toEqual(proposal.snapshot);
    expect(first.scope.budget).toEqual(proposal.budget);
    expect(first.scope.assignments[0].contextPaths).toEqual(["a.ts"]);
    expect(first.scope).not.toHaveProperty("invocation");
    expect(getApprovedStaffingScope(first.scope.id)).toEqual(first);
    const second = approveStaffingProposal({
      ...proposal,
      id: "proposal-next",
      goal: { ...proposal.goal, objective: "Another Goal" },
    });
    expect(second.status).toBe("approved");
    expect(terminal.prompts).toBe(prompts);
    expect(git("status", "--porcelain")).toBe("");
  });
  it.each(["specialist", "context", "budget"])(
    "requests exact direct Human approval when delegation does not cover %s",
    (kind) => {
      delegate();
      if (kind === "specialist") proposal.assignments[0].specialistId = "ux";
      if (kind === "context") proposal.assignments[0].contextPaths = ["b.ts"];
      if (kind === "budget") proposal.budget.maxAgentInvocations = 3;
      const request = approveStaffingProposal(proposal);
      expect(request.status).toBe("approval-required");
      const result = approveStaffingProposal(proposal, accept(request));
      expect(result.status).toBe("approved");
      if (result.status === "approved")
        expect(result.approval.source.type).toBe("direct-human");
    }
  );
  it("requires direct Human approval without any delegation", () => {
    expect(approveStaffingProposal(proposal).status).toBe("approval-required");
  });
  it("does not accept booleans or forged/serialized confirmation receipts", () => {
    expect(approveStaffingProposal(proposal, { token: "forged" }).status).toBe(
      "denied"
    );
    const receipt = accept(approveStaffingProposal(proposal));
    expect(
      approveStaffingProposal(proposal, JSON.parse(JSON.stringify(receipt)))
        .status
    ).toBe("denied");
    expect(approveStaffingProposal(proposal, receipt).status).toBe("approved");
  });
  it.each(["Reject\n", "", "Approve\n", "approve-eof"])(
    "rejects non-challenge or EOF input %j",
    (answer) => {
      const request = approveStaffingProposal(proposal);
      terminal.answer = answer;
      if (request.status !== "approval-required")
        throw new Error("Expected review");
      expect(confirmHumanAction(request.binding, request.reason)).toBeNull();
    }
  );
  it("fails closed without a controlling terminal", () => {
    terminal.available = false;
    expect(confirmHumanAction("binding", "review")).toBeNull();
  });
  it("does not accept a schema-valid delegation as Human-approved data", () => {
    const request = configureHumanDelegation(root, delegation);
    expect(request.status).toBe("approval-required");
    expect(
      configureHumanDelegation(root, delegation, { token: "forged" }).status
    ).toBe("denied");
    expect(approveStaffingProposal(proposal).status).toBe("approval-required");
  });
  it.each([
    "unregistered",
    "outside",
    "budget",
    "write",
    "duplicate-id",
    "policy",
  ])(
    "System Policy violation %s cannot be overridden by Human confirmation",
    (kind) => {
      const receipt = accept(approveStaffingProposal(proposal));
      if (kind === "unregistered")
        proposal.assignments[0].specialistId = "invented";
      if (kind === "outside")
        proposal.assignments[0].contextPaths = ["missing.ts"];
      if (kind === "budget") proposal.budget.maxAgentInvocations = 5;
      if (kind === "write")
        proposal = { ...proposal, authority: "write" } as StaffingProposal;
      if (kind === "duplicate-id")
        proposal.assignments.push({
          ...proposal.assignments[0],
          specialistId: "ux",
        });
      if (kind === "policy") {
        system.policy.enforcementRules = [
          { type: "specialists", allowedSpecialistIds: ["ux"] },
        ];
        expect(
          configureStaffingSystemPolicy(
            system,
            accept(configureStaffingSystemPolicy(system))
          ).status
        ).toBe("configured");
      }
      expect(approveStaffingProposal(proposal, receipt).status).toBe("denied");
    }
  );
  it.each(["HEAD", "dirty"])(
    "rechecks %s after direct approval wait",
    (kind) => {
      const receipt = accept(approveStaffingProposal(proposal));
      if (kind === "HEAD")
        git("commit", "--quiet", "--allow-empty", "-m", "changed");
      else writeFileSync(join(root, "a.ts"), "changed");
      expect(approveStaffingProposal(proposal, receipt).status).toBe("denied");
    }
  );
  it("binds direct confirmation to every Proposal field, including original Human Constraints", () => {
    const receipt = accept(approveStaffingProposal(proposal));
    proposal.goal.constraints = [];
    expect(approveStaffingProposal(proposal, receipt).status).toBe("denied");
    expect(approveStaffingProposal(proposal, receipt).status).toBe("denied");
  });
  it("rejects duplicate issuance and Proposal ID reuse with changed content", () => {
    delegate();
    expect(approveStaffingProposal(proposal).status).toBe("approved");
    expect(approveStaffingProposal(proposal).status).toBe("denied");
    proposal.goal.objective = "Changed";
    expect(approveStaffingProposal(proposal).status).toBe("denied");
  });
  it("revocation stops new delegated approvals and authenticated Scope retrieval", () => {
    delegate();
    const result = approveStaffingProposal(proposal);
    expect(
      configureHumanDelegation(
        root,
        null,
        accept(configureHumanDelegation(root, null))
      ).status
    ).toBe("configured");
    expect(approveStaffingProposal({ ...proposal, id: "new" }).status).toBe(
      "denied"
    );
    if (result.status === "approved")
      expect(getApprovedStaffingScope(result.scope.id).status).toBe("denied");
  });
  it("expiry stops automatic approvals", () => {
    delegate();
    vi.spyOn(Date, "now").mockReturnValue(Date.parse(delegation.expiresAt) + 1);
    expect(approveStaffingProposal(proposal).status).toBe("denied");
  });
  it("rejects expired, write-enabled or unknown-field delegation policies", () => {
    expect(
      configureHumanDelegation(root, {
        ...delegation,
        expiresAt: "2000-01-01T00:00:00.000Z",
      }).status
    ).toBe("denied");
    expect(
      configureHumanDelegation(root, {
        ...delegation,
        repositoryAccess: "write",
      }).status
    ).toBe("denied");
    expect(
      configureHumanDelegation(root, { ...delegation, approved: true }).status
    ).toBe("denied");
  });
  it("policy replacement invalidates pending direct confirmation and old automatic coverage", () => {
    delegate();
    proposal.budget.maxAgentInvocations = 3;
    const receipt = accept(approveStaffingProposal(proposal));
    delegation.allowedSpecialistIds = ["ux"];
    delegate();
    expect(approveStaffingProposal(proposal, receipt).status).toBe("denied");
  });
  it("System Policy changes require a new delegation approval", () => {
    delegate();
    expect(
      configureStaffingSystemPolicy(
        system,
        accept(configureStaffingSystemPolicy(system))
      ).status
    ).toBe("configured");
    expect(approveStaffingProposal(proposal).status).toBe("denied");
  });
  it("rejects forged or modified stored signatures rather than reverting to direct approval", () => {
    delegate();
    const path = join(home, ".ai-workspace-governance", "records.json");
    const envelope = JSON.parse(readFileSync(path, "utf8"));
    envelope.payload += " ";
    writeFileSync(path, JSON.stringify(envelope));
    expect(approveStaffingProposal(proposal).status).toBe("denied");
  });
  it("rejects missing history, unsafe permissions, symlinks and concurrent locks", () => {
    const directory = join(home, ".ai-workspace-governance");
    chmodSync(directory, 0o755);
    expect(approveStaffingProposal(proposal).status).toBe("denied");
    chmodSync(directory, 0o700);
    mkdirSync(join(directory, "lock"));
    expect(approveStaffingProposal(proposal).status).toBe("denied");
    rmSync(join(directory, "lock"), { recursive: true });
    const path = join(directory, "records.json");
    const original = readFileSync(path);
    rmSync(path);
    symlinkSync(join(root, "a.ts"), path);
    expect(approveStaffingProposal(proposal).status).toBe("denied");
    rmSync(path);
    expect(approveStaffingProposal(proposal).status).toBe("denied");
    writeFileSync(path, original, { mode: 0o600 });
  });
  it("denies inconsistent record/Scope links even if trusted code accidentally saved them", () => {
    delegate();
    const result = approveStaffingProposal(proposal);
    if (result.status !== "approved") throw new Error("Expected Scope");
    withGovernanceRecords((data, save) => {
      const ledger = data as {
        repositories: Record<
          string,
          {
            issuances: { scope: { budget: { maxAgentInvocations: number } } }[];
          }
        >;
      };
      Object.values(
        ledger.repositories
      )[0].issuances[0].scope.budget.maxAgentInvocations = 99;
      save(ledger);
    });
    expect(getApprovedStaffingScope(result.scope.id).status).toBe("denied");
  });
  it("does not expose raw absolute paths or file data on failure", () => {
    proposal.snapshot.repositoryRoot = "/private/secret";
    const result = approveStaffingProposal(proposal);
    expect(result.status).toBe("denied");
    expect(JSON.stringify(result)).not.toContain("/private/secret");
  });
});
