import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  getStaffingSystemPolicy,
  approveStaffingProposal,
  type StaffingApprovalResult,
} from "@/application/governance/index.js";
import {
  runStaffing,
  type StaffingProposal,
} from "@/application/staffing/index.js";
import {
  runStaffingApproval,
  type StaffingApprovalWorkflowOptions,
} from "./staffing-approval.js";

vi.mock("@/application/governance/index.js", () => ({
  getStaffingSystemPolicy: vi.fn(),
  approveStaffingProposal: vi.fn(),
}));
vi.mock("@/application/staffing/index.js", () => ({ runStaffing: vi.fn() }));
const goal = {
  objective: "Review login",
  targetRepository: "repo",
  constraints: ["No edits"],
};
const proposal: StaffingProposal = {
  id: "proposal",
  goal,
  snapshot: { repositoryRoot: "/repo", commitSha: "abc" },
  intent: {
    problem: "Login",
    desiredOutcome: "Analysis",
    considerations: [],
    uncertainties: [],
  },
  assignments: [
    {
      assignmentId: "assignment",
      specialistId: "frontend",
      objective: "Analyze",
      contextPaths: ["a.ts"],
      rationale: "UI",
    },
  ],
  budget: { maxAgentInvocations: 1 },
  rationale: "Review",
};
const policy = {
  repositoryRoot: "/repo",
  phase: "phase-a" as const,
  availableSpecialists: [
    {
      id: "frontend",
      role: "UI",
      objective: "Analyze",
      authority: { repositoryAccess: "read" as const, shellExecution: false },
    },
  ],
  contextAccessPolicy: {
    allowedScopes: [{ kind: "file" as const, path: "a.ts" }],
  },
  limits: {
    maxFilesPerRequest: 2,
    maxTotalFiles: 3,
    maxFileBytes: 1024,
    maxContextBytes: 10000,
    maxFileTreeEntries: 10,
  },
  maxAgentInvocations: 2,
};
const required = () => ({
  status: "approval-required" as const,
  kind: "staffing" as const,
  subject: structuredClone(proposal),
  binding: "binding",
  reason: "Direct approval required",
});
let options: StaffingApprovalWorkflowOptions;
beforeEach(() => {
  vi.resetAllMocks();
  options = {
    repositoryPath: "/repo",
    goal: structuredClone(goal),
    maxRounds: 3,
    timeoutMs: 1000,
    agent: vi.fn(),
  };
  vi.mocked(getStaffingSystemPolicy).mockReturnValue({
    status: "ready",
    configuration: policy,
    version: 1,
  });
  vi.mocked(runStaffing).mockResolvedValue({
    status: "proposed",
    proposal,
    rounds: 1,
  });
  vi.mocked(approveStaffingProposal).mockReturnValue({
    status: "denied",
    reason: "Denied",
  });
});
describe("Staffing → Approval orchestration", () => {
  it("passes only the trusted configuration into Staffing and the exact returned Proposal into Approval", async () => {
    await runStaffingApproval(options);
    expect(getStaffingSystemPolicy).toHaveBeenCalledWith("/repo");
    expect(runStaffing).toHaveBeenCalledWith({
      goal: options.goal,
      systemPolicy: policy,
      maxRounds: 3,
      timeoutMs: 1000,
      agent: options.agent,
    });
    expect(vi.mocked(approveStaffingProposal).mock.calls[0][0]).toBe(proposal);
  });
  it("never starts Staffing or Approval when policy retrieval fails", async () => {
    vi.mocked(getStaffingSystemPolicy).mockReturnValue({
      status: "denied",
      reason: "Legacy or missing policy",
    });
    expect(await runStaffingApproval(options)).toMatchObject({
      status: "failed",
      failure: "system-policy",
      rounds: 0,
    });
    expect(runStaffing).not.toHaveBeenCalled();
    expect(approveStaffingProposal).not.toHaveBeenCalled();
  });
  it.each(["failed", "escalated"] as const)(
    "returns Staffing %s without approval",
    async (status) => {
      const result =
        status === "failed"
          ? {
              status,
              failure: "agent-process" as const,
              reason: "Agent failed",
              rounds: 1,
            }
          : {
              status,
              reason: "Ambiguous",
              questions: ["Which flow?"],
              rounds: 1,
            };
      vi.mocked(runStaffing).mockResolvedValue(result);
      expect(await runStaffingApproval(options)).toBe(result);
      expect(approveStaffingProposal).not.toHaveBeenCalled();
    }
  );
  it.each(["approved", "denied"] as const)(
    "returns immediate %s without requesting Human input",
    async (status) => {
      const result = (
        status === "approved"
          ? { status, approval: {}, scope: {} }
          : { status, reason: "Invalid delegation" }
      ) as StaffingApprovalResult;
      vi.mocked(approveStaffingProposal).mockReturnValue(result);
      options.confirmApproval = vi.fn();
      expect(await runStaffingApproval(options)).toBe(result);
      expect(options.confirmApproval).not.toHaveBeenCalled();
    }
  );
  it("reports pending approval when no Human callback is supplied", async () => {
    const request = required();
    vi.mocked(approveStaffingProposal).mockReturnValue(request);
    expect(await runStaffingApproval(options)).toEqual({
      status: "approval-required",
      request,
    });
    expect(approveStaffingProposal).toHaveBeenCalledTimes(1);
  });
  it("resubmits the same Proposal once after confirmation and isolates it from UI mutations", async () => {
    const original = structuredClone(proposal);
    const receipt = { token: "receipt" };
    const approved = {
      status: "approved",
      approval: {},
      scope: {},
    } as StaffingApprovalResult;
    vi.mocked(approveStaffingProposal)
      .mockReturnValueOnce(required())
      .mockReturnValueOnce(approved);
    options.confirmApproval = vi.fn(async (request) => {
      expect(request.binding).toBe("binding");
      if (request.subject && "goal" in request.subject)
        request.subject.goal.constraints = ["UI overwrite"];
      return receipt;
    });
    expect(await runStaffingApproval(options)).toBe(approved);
    expect(runStaffing).toHaveBeenCalledTimes(1);
    expect(approveStaffingProposal).toHaveBeenCalledTimes(2);
    expect(vi.mocked(approveStaffingProposal).mock.calls[1][0]).toBe(proposal);
    expect(approveStaffingProposal).toHaveBeenLastCalledWith(proposal, receipt);
    expect(proposal).toEqual(original);
    expect(options.goal).toEqual(goal);
  });
  it("does not resubmit after rejection or unavailable confirmation", async () => {
    vi.mocked(approveStaffingProposal).mockReturnValue(required());
    options.confirmApproval = vi.fn(() => null);
    expect(await runStaffingApproval(options)).toMatchObject({
      status: "rejected",
    });
    expect(approveStaffingProposal).toHaveBeenCalledTimes(1);
  });
  it("fails safely on confirmation exceptions", async () => {
    vi.mocked(approveStaffingProposal).mockReturnValue(required());
    options.confirmApproval = () => {
      throw new Error("private path");
    };
    expect(await runStaffingApproval(options)).toEqual({
      status: "failed",
      failure: "confirmation",
      reason: "Human Staffing confirmation failed.",
      rounds: 1,
    });
    expect(approveStaffingProposal).toHaveBeenCalledTimes(1);
  });
});
