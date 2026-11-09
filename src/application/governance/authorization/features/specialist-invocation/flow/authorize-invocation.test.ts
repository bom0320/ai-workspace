import * as fileSystem from "node:fs";
import { spawn } from "node:child_process";
import { runStaffing } from "@/application/staffing/index.js";
import { governanceDigest } from "@/services/governance-records/index.js";
import type { GovernanceLedger } from "../../../../model/ledger.js";
import * as gitInfrastructure from "@/infrastructure/git/index.js";
import * as approvalValidation from "../../../../approval/index.js";
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
  approveStaffingProposal,
  authorizeSpecialistInvocation,
  createInvocationAttempt,
  type ApprovedOperatingScope,
  type InvokeSpecialistRequest,
  configureHumanDelegation,
  getApprovedStaffingScope,
  type StaffingApprovalResult,
  type StaffingSystemPolicy,
} from "@/application/governance/index.js";
import { confirmHumanAction } from "@/infrastructure/terminal/index.js";
import { withGovernanceRecords } from "@/services/governance-records/index.js";

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
let proposal: import("@/application/staffing/index.js").StaffingProposal;
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
  if (!receipt) throw new Error("Expected terminal receipt");
  return receipt;
}
function configure() {
  return configureStaffingSystemPolicy(
    system,
    accept(configureStaffingSystemPolicy(system))
  );
}
function delegate() {
  const policy = {
    allowedSpecialistIds: ["frontend", "ux"],
    delegatedContextScopes: [
      { kind: "file" as const, path: "a.ts" },
      { kind: "file" as const, path: "b.ts" },
    ],
    maxAgentInvocations: 3,
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
function approve(
  mode: "direct" | "delegated" = "direct"
): ApprovedOperatingScope {
  if (mode === "delegated") delegate();
  const initial = approveStaffingProposal(proposal);
  const result =
    initial.status === "approval-required"
      ? approveStaffingProposal(proposal, accept(initial))
      : initial;
  if (result.status !== "approved") throw new Error(JSON.stringify(result));
  return result.scope;
}
function request(
  scope: ApprovedOperatingScope,
  index = 0
): InvokeSpecialistRequest {
  return {
    scopeId: scope.id,
    scopeVersion: scope.version,
    assignmentId: scope.assignments[index].assignmentId,
    requestedContextPaths: [scope.assignments[index].contextPaths[0]],
  };
}
function reservations() {
  return withGovernanceRecords(
    (raw) =>
      Object.values((raw as GovernanceLedger).repositories)[0].reservations ??
      []
  );
}
function recordPath() {
  return join(home, ".ai-workspace-governance", "records.json");
}
beforeEach(async () => {
  home = mkdtempSync(join(tmpdir(), "authorization-home-"));
  terminal.home = home;
  root = realpathSync(mkdtempSync(join(tmpdir(), "authorization-repo-")));
  git("init", "--quiet");
  git("config", "user.name", "Test");
  git("config", "user.email", "test@example.com");
  writeFileSync(join(root, "a.ts"), "export const a = 1;\n");
  writeFileSync(join(root, "b.ts"), "export const b = 2;\n");
  git("add", ".");
  git("commit", "--quiet", "-m", "initial");
  system = {
    repositoryRoot: root,
    phase: "phase-a",
    availableSpecialists: ["frontend", "ux"].map((id) => ({
      id,
      role: id,
      objective: `Default ${id} role`,
      authority: { repositoryAccess: "read", shellExecution: false },
    })),
    contextAccessPolicy: {
      allowedScopes: ["a.ts", "b.ts"].map((path) => ({ kind: "file", path })),
    },
    limits: {
      maxFilesPerRequest: 2,
      maxTotalFiles: 2,
      maxFileBytes: 4096,
      maxContextBytes: 20000,
      maxFileTreeEntries: 10,
    },
    maxAgentInvocations: 3,
  };
  expect(configure().status).toBe("configured");
  const result = await runStaffing({
    goal: {
      objective: "Analyze UI",
      targetRepository: "repo",
      constraints: ["No changes"],
    },
    systemPolicy: system,
    maxRounds: 1,
    agent: async () => ({
      type: "propose",
      draft: {
        intent: {
          problem: "UI",
          desiredOutcome: "Analysis",
          considerations: [],
          uncertainties: [],
        },
        assignments: [
          {
            specialistId: "frontend",
            objective: "Goal-specific frontend analysis",
            contextPaths: ["a.ts", "b.ts"],
            rationale: "UI",
          },
          {
            specialistId: "ux",
            objective: "Goal-specific UX analysis",
            contextPaths: ["b.ts"],
            rationale: "UX",
          },
        ],
        budget: { maxAgentInvocations: 3 },
        rationale: "Independent analysis",
      },
    }),
  });
  if (result.status !== "proposed") throw new Error(JSON.stringify(result));
  proposal = result.proposal;
});
afterEach(() => {
  vi.restoreAllMocks();
  rmSync(root, { recursive: true, force: true });
  rmSync(home, { recursive: true, force: true });
});

describe("Scope-backed Invocation Authorization, no Specialist execution", () => {
  it.each(["direct", "delegated"] as const)(
    "authorizes a %s Scope and records exact request/input digests",
    (mode) => {
      const scope = approve(mode);
      const input = request(scope);
      const attempt = createInvocationAttempt();
      const result = authorizeSpecialistInvocation(input, attempt);
      expect(result.status).toBe("allowed");
      if (result.status !== "allowed") throw new Error(JSON.stringify(result));
      expect(result.invocation).toMatchObject({
        invocationId: attempt.invocationId,
        scopeId: scope.id,
        scopeVersion: scope.version,
        assignmentId: scope.assignments[0].assignmentId,
        assignmentObjective: "Goal-specific frontend analysis",
        goal: scope.goal,
        snapshot: scope.snapshot,
        specialist: system.availableSpecialists[0],
        files: [{ path: "a.ts", content: "export const a = 1;\n" }],
      });
      expect(result.invocation.specialist.objective).not.toBe(
        result.invocation.assignmentObjective
      );
      expect(reservations()).toEqual([
        {
          invocationId: attempt.invocationId,
          scopeId: scope.id,
          scopeVersion: scope.version,
          assignmentId: input.assignmentId,
          requestDigest: governanceDigest(input),
          invocationDigest: governanceDigest(result.invocation),
          reservedAt: expect.any(String),
        },
      ]);
      expect(git("status", "--porcelain")).toBe("");
    }
  );
  it.each([
    "missing",
    "version",
    "assignment",
    "context",
    "absolute",
    "duplicate",
    "objective",
    "authority",
    "invocationId",
  ])("denies %s request without reserving", (kind) => {
    const input = request(approve()) as InvokeSpecialistRequest &
      Record<string, unknown>;
    if (kind === "missing") input.scopeId = "missing";
    if (kind === "version") input.scopeVersion++;
    if (kind === "assignment") input.assignmentId = "missing";
    if (kind === "context") input.requestedContextPaths = ["not-approved.ts"];
    if (kind === "absolute") input.requestedContextPaths = ["/a.ts"];
    if (kind === "duplicate") input.requestedContextPaths = ["a.ts", "a.ts"];
    if (["objective", "authority", "invocationId"].includes(kind))
      input[kind] = "CEO injection";
    const before = readFileSync(recordPath(), "utf8");
    const result = authorizeSpecialistInvocation(input);
    expect(result.status).toBe("denied");
    expect(result).not.toHaveProperty("invocation");
    expect(reservations()).toHaveLength(0);
    expect(readFileSync(recordPath(), "utf8")).toBe(before);
  });
  it("rejects failed approval and externally parsed Scope objects", () => {
    expect(
      authorizeSpecialistInvocation({
        ...request({
          id: "fake",
          version: 1,
          assignments: [{ assignmentId: "a", contextPaths: ["a.ts"] }],
        } as ApprovedOperatingScope),
        scope: {},
      }).status
    ).toBe("denied");
    expect(reservations()).toHaveLength(0);
  });
  it("consumes budget across Assignments, permits new calls with the same Context, and denies duplicate attempts", () => {
    const scope = approve();
    const input = request(scope);
    const attempt = createInvocationAttempt();
    expect(authorizeSpecialistInvocation(input, attempt).status).toBe(
      "allowed"
    );
    expect(authorizeSpecialistInvocation(input, attempt).status).toBe("denied");
    expect(reservations()).toHaveLength(1);
    expect(authorizeSpecialistInvocation(input, { ...attempt }).status).toBe(
      "denied"
    );
    expect(authorizeSpecialistInvocation(input).status).toBe("allowed");
    expect(authorizeSpecialistInvocation(request(scope, 1)).status).toBe(
      "allowed"
    );
    expect(authorizeSpecialistInvocation(input).status).toBe("denied");
    expect(reservations()).toHaveLength(3);
  });
  it("rejects stale System Policy and preserves old reservations", () => {
    const scope = approve();
    expect(authorizeSpecialistInvocation(request(scope)).status).toBe(
      "allowed"
    );
    configure();
    expect(authorizeSpecialistInvocation(request(scope)).status).toBe("denied");
    expect(reservations()).toHaveLength(1);
  });
  it.each(["expired", "revoked", "superseded", "system-version"])(
    "rejects %s Delegation at Authorization",
    (kind) => {
      const scope = approve("delegated");
      if (kind === "expired")
        vi.spyOn(Date, "now").mockReturnValue(Date.now() + 2 * 86400000);
      else if (kind === "revoked")
        configureHumanDelegation(
          root,
          null,
          accept(configureHumanDelegation(root, null))
        );
      else if (kind === "superseded") delegate();
      else configure();
      expect(authorizeSpecialistInvocation(request(scope)).status).toBe(
        "denied"
      );
      expect(reservations()).toHaveLength(0);
    }
  );
  it("retains Direct Scope validity after unrelated Delegation revocation", () => {
    const scope = approve();
    delegate();
    configureHumanDelegation(
      root,
      null,
      accept(configureHumanDelegation(root, null))
    );
    expect(authorizeSpecialistInvocation(request(scope)).status).toBe(
      "allowed"
    );
  });
  it.each(["dirty", "head", "load-error"])(
    "denies %s Snapshot/content failure without reservation",
    (kind) => {
      const scope = approve();
      if (kind === "load-error")
        vi.spyOn(
          gitInfrastructure,
          "readRepositoryFileAtCommit"
        ).mockImplementation(() => {
          throw new Error("Load failed");
        });
      else {
        writeFileSync(join(root, "a.ts"), "changed");
        if (kind === "head") {
          git("add", ".");
          git("commit", "--quiet", "-m", "drift");
        }
      }
      expect(authorizeSpecialistInvocation(request(scope)).status).toBe(
        "denied"
      );
      expect(reservations()).toHaveLength(0);
    }
  );
  it("does not allow on atomic record write failure and allows explicit retry only if nothing persisted", () => {
    const scope = approve();
    const input = request(scope);
    const attempt = createInvocationAttempt();
    const before = readFileSync(recordPath(), "utf8");
    vi.spyOn(fileSystem, "renameSync").mockImplementationOnce(() => {
      throw new Error("Write failed");
    });
    expect(authorizeSpecialistInvocation(input, attempt).status).toBe("denied");
    expect(readFileSync(recordPath(), "utf8")).toBe(before);
    expect(reservations()).toHaveLength(0);
    expect(authorizeSpecialistInvocation(input, attempt).status).toBe(
      "allowed"
    );
  });
  it("reads historical records without adding defaults, then appends only the new reservation", () => {
    const scope = approve();
    withGovernanceRecords((raw) =>
      expect(
        Object.values((raw as GovernanceLedger).repositories)[0]
      ).not.toHaveProperty("reservations")
    );
    const before = readFileSync(recordPath(), "utf8");
    expect(getApprovedStaffingScope(scope.id).status).toBe("approved");
    expect(readFileSync(recordPath(), "utf8")).toBe(before);
    expect(authorizeSpecialistInvocation(request(scope)).status).toBe(
      "allowed"
    );
    expect(getApprovedStaffingScope(scope.id).status).toBe("approved");
  });
  it("rechecks Scope/Delegation after files are loaded and before saving", () => {
    const scope = approve("delegated");
    const validate = approvalValidation.validateStoredIssuance;
    vi.spyOn(
      approvalValidation,
      "validateStoredIssuance"
    ).mockImplementationOnce((...args) => {
      const files = validate(...args);
      vi.spyOn(Date, "now").mockReturnValue(Date.now() + 2 * 86400000);
      return files;
    });
    expect(authorizeSpecialistInvocation(request(scope)).status).toBe("denied");
    expect(reservations()).toHaveLength(0);
  });
  it("bounds the actual Authorized Invocation JSON including approved Assignment IDs", () => {
    proposal.assignments[0].assignmentId = "a".repeat(
      system.limits.maxContextBytes
    );
    const scope = approve();
    expect(getApprovedStaffingScope(scope.id).status).toBe("approved");
    expect(authorizeSpecialistInvocation(request(scope)).status).toBe("denied");
    expect(reservations()).toHaveLength(0);
  });
  it("rejects inconsistent file contents between initial loading and final validation", () => {
    const scope = approve();
    const validate = approvalValidation.validateStoredIssuance;
    vi.spyOn(
      approvalValidation,
      "validateStoredIssuance"
    ).mockImplementationOnce((...args) =>
      validate(...args).map((file) => ({
        ...file,
        content: "unexpected stale content",
      }))
    );
    expect(authorizeSpecialistInvocation(request(scope)).status).toBe("denied");
    expect(reservations()).toHaveLength(0);
  });
  it("rejects Snapshot drift between initial file loading and final reservation", () => {
    const scope = approve();
    const validate = approvalValidation.validateStoredIssuance;
    vi.spyOn(
      approvalValidation,
      "validateStoredIssuance"
    ).mockImplementationOnce((...args) => {
      const files = validate(...args);
      writeFileSync(join(root, "a.ts"), "late drift");
      return files;
    });
    expect(authorizeSpecialistInvocation(request(scope)).status).toBe("denied");
    expect(reservations()).toHaveLength(0);
  });
  it.each(["version", "assignment", "duplicate"])(
    "fails closed on malformed signed reservation %s history",
    (kind) => {
      const scope = approve();
      expect(authorizeSpecialistInvocation(request(scope)).status).toBe(
        "allowed"
      );
      withGovernanceRecords((raw, save) => {
        const ledger = raw as GovernanceLedger;
        const records = Object.values(ledger.repositories)[0].reservations!;
        if (kind === "version") records[0].scopeVersion++;
        if (kind === "assignment") records[0].assignmentId = "missing";
        if (kind === "duplicate") records.push(structuredClone(records[0]));
        save(ledger);
      });
      const before = readFileSync(recordPath(), "utf8");
      expect(authorizeSpecialistInvocation(request(scope)).status).toBe(
        "denied"
      );
      expect(readFileSync(recordPath(), "utf8")).toBe(before);
    }
  );
  it.each(["uid", "future"])(
    "rejects invalid signed System approval evidence %s",
    (kind) => {
      const scope = approve();
      withGovernanceRecords((raw, save) => {
        const ledger = raw as GovernanceLedger;
        const evidence = Object.values(ledger.repositories)[0].systems.at(
          -1
        )!.approval;
        if (kind === "uid") evidence.uid++;
        else
          evidence.confirmedAt = new Date(Date.now() + 86400000).toISOString();
        save(ledger);
      });
      expect(authorizeSpecialistInvocation(request(scope)).status).toBe(
        "denied"
      );
      expect(reservations()).toHaveLength(0);
    }
  );
  it("enforces budget atomically across real competing processes", async () => {
    proposal.budget.maxAgentInvocations = 1;
    const scope = approve();
    const input = request(scope);
    const script = `import { authorizeSpecialistInvocation } from './src/application/governance/index.ts'; console.log(JSON.stringify(authorizeSpecialistInvocation(${JSON.stringify(input)})));`;
    const call = () =>
      new Promise<string>((resolve, reject) => {
        const child = spawn(
          process.execPath,
          ["--import", "tsx", "--input-type=module", "-e", script],
          {
            cwd: process.cwd(),
            env: {
              ...process.env,
              HOME: home,
              TSX_TSCONFIG_PATH: join(process.cwd(), "tsconfig.json"),
            },
          }
        );
        let out = "",
          error = "";
        child.stdout.on("data", (chunk) => (out += chunk));
        child.stderr.on("data", (chunk) => (error += chunk));
        child.on("error", reject);
        child.on("close", (code) =>
          code === 0
            ? resolve(JSON.parse(out).status)
            : reject(new Error(error))
        );
      });
    const results = await Promise.all([call(), call(), call()]);
    expect(results.filter((status) => status === "allowed")).toHaveLength(1);
    expect(reservations()).toHaveLength(1);
  });
});
