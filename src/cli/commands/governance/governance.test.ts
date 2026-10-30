import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  approveStaffingProposal,
  configureHumanDelegation,
  configureStaffingSystemPolicy,
  type StaffingApprovalResult,
} from "@/application/governance/index.js";
import { confirmHumanAction } from "@/infrastructure/terminal/index.js";
import { runGovernanceCli } from "./governance.js";

vi.mock("@/application/governance/index.js", () => ({
  approveStaffingProposal: vi.fn(),
  configureHumanDelegation: vi.fn(),
  configureStaffingSystemPolicy: vi.fn(),
}));
vi.mock("@/infrastructure/terminal/index.js", () => ({
  confirmHumanAction: vi.fn(),
}));
let root: string;
const proposal = {
  id: "proposal-1",
  goal: {
    objective: "Review login",
    targetRepository: "example",
    constraints: ["Preserve keyboard navigation", "No code edits"],
  },
  snapshot: { repositoryRoot: "/repository", commitSha: "abc" },
  intent: {
    problem: "Login",
    desiredOutcome: "Analysis",
    considerations: [],
    uncertainties: [],
  },
  assignments: [
    {
      assignmentId: "a1",
      specialistId: "frontend",
      objective: "Review feedback",
      contextPaths: ["src/login.ts"],
      rationale: "Frontend",
    },
  ],
  budget: { maxAgentInvocations: 2 },
  rationale: "Analyze",
};
beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), "governance-cli-"));
  vi.resetAllMocks();
  vi.spyOn(console, "log").mockImplementation(() => {});
  vi.spyOn(console, "error").mockImplementation(() => {});
  writeFileSync(join(root, "proposal.json"), JSON.stringify(proposal));
});
afterEach(() => {
  vi.restoreAllMocks();
  rmSync(root, { recursive: true, force: true });
});
function required(
  kind: "staffing" | "delegation" | "system-policy",
  subject: unknown
): StaffingApprovalResult {
  return {
    status: "approval-required",
    kind,
    subject,
    binding: "exact-binding",
    reason: "Outside delegated Context",
  } as StaffingApprovalResult;
}
describe("Governance CLI Human decision surface", () => {
  it("shows original instructions, assignments, Context, budget and reason before direct confirmation", async () => {
    vi.mocked(approveStaffingProposal)
      .mockReturnValueOnce(required("staffing", proposal))
      .mockReturnValue({
        status: "denied",
        reason: "test stops after confirmation",
      });
    const receipt = { token: "opaque-test-receipt" };
    vi.mocked(confirmHumanAction).mockReturnValue(receipt);
    expect(
      await runGovernanceCli(["approve", join(root, "proposal.json")])
    ).toBe(1);
    const [binding, review] = vi.mocked(confirmHumanAction).mock.calls[0];
    expect(binding).toBe("exact-binding");
    for (const text of [
      "Review login",
      "Preserve keyboard navigation",
      "No code edits",
      "frontend",
      "Review feedback",
      "src/login.ts",
      "Invocation Budget: 2",
      "Outside delegated Context",
      "new validated Proposal",
    ])
      expect(review).toContain(text);
    expect(approveStaffingProposal).toHaveBeenLastCalledWith(proposal, receipt);
  });
  it("does not request Human input for an existing delegated approval", async () => {
    vi.mocked(approveStaffingProposal).mockReturnValue({
      status: "approved",
      approval: {},
      scope: {},
    } as StaffingApprovalResult);
    expect(
      await runGovernanceCli(["approve", join(root, "proposal.json")])
    ).toBe(0);
    expect(confirmHumanAction).not.toHaveBeenCalled();
  });
  it("does not offer Human override of System Policy denial", async () => {
    vi.mocked(approveStaffingProposal).mockReturnValue({
      status: "denied",
      reason: "System Policy",
    });
    expect(
      await runGovernanceCli(["approve", join(root, "proposal.json")])
    ).toBe(1);
    expect(confirmHumanAction).not.toHaveBeenCalled();
  });
  it("Reject/EOF/unavailable terminal never retries with a fabricated receipt", async () => {
    vi.mocked(approveStaffingProposal).mockReturnValue(
      required("staffing", proposal)
    );
    vi.mocked(confirmHumanAction).mockReturnValue(null);
    expect(
      await runGovernanceCli(["approve", join(root, "proposal.json")])
    ).toBe(1);
    expect(approveStaffingProposal).toHaveBeenCalledTimes(1);
  });
  it("requires Human confirmation for initial System Policy configuration", async () => {
    const configuration = { repositoryRoot: "/repository", phase: "phase-a" };
    writeFileSync(join(root, "system.json"), JSON.stringify(configuration));
    vi.mocked(configureStaffingSystemPolicy)
      .mockReturnValueOnce(required("system-policy", configuration))
      .mockReturnValue({ status: "configured", version: 1 });
    vi.mocked(confirmHumanAction).mockReturnValue({ token: "receipt" });
    expect(await runGovernanceCli(["setup", join(root, "system.json")])).toBe(
      0
    );
    expect(configureStaffingSystemPolicy).toHaveBeenCalledTimes(2);
    expect(vi.mocked(confirmHumanAction).mock.calls[0][1]).toContain(
      '"phase": "phase-a"'
    );
  });
  it("routes delegation replacement and revocation separately from staffing approval", async () => {
    writeFileSync(
      join(root, "delegation.json"),
      JSON.stringify({ phase: "phase-a" })
    );
    vi.mocked(configureHumanDelegation).mockReturnValue({
      status: "configured",
      version: 2,
    });
    expect(
      await runGovernanceCli([
        "delegate",
        "/repository",
        join(root, "delegation.json"),
      ])
    ).toBe(0);
    expect(configureHumanDelegation).toHaveBeenCalledWith(
      "/repository",
      { phase: "phase-a" },
      undefined
    );
    expect(await runGovernanceCli(["revoke", "/repository"])).toBe(0);
    expect(configureHumanDelegation).toHaveBeenCalledWith(
      "/repository",
      null,
      undefined
    );
  });
});
