import { beforeEach, describe, expect, expectTypeOf, it, vi } from "vitest";
import {
  getStaffingSystemPolicy,
  type StaffingSystemPolicy,
  type StaffingSystemPolicyResult,
  approveStaffingProposal,
  authorizeSpecialistInvocation,
  claimAuthorizedInvocation,
} from "@/application/governance/index.js";
import {
  runStaffing,
  type StaffingProposal,
  type StaffingRunResult,
} from "@/application/staffing/index.js";
import { createPhaseAGraph, type PhaseAState } from "./index.js";
import { developmentOrganizationState } from "../state.js";

vi.mock("@/application/governance/index.js", async (original) => ({
  ...(await original<typeof import("@/application/governance/index.js")>()),
  getStaffingSystemPolicy: vi.fn(),
  approveStaffingProposal: vi.fn(),
  authorizeSpecialistInvocation: vi.fn(),
  claimAuthorizedInvocation: vi.fn(),
}));

vi.mock("@/application/staffing/index.js", async (original) => ({
  ...(await original<typeof import("@/application/staffing/index.js")>()),
  runStaffing: vi.fn(),
}));

const goal = {
  objective: "Review UI",
  targetRepository: "repository",
  constraints: ["No edits"],
};
const systemPolicy: StaffingSystemPolicy = {
  repositoryRoot: "/repository",
  phase: "phase-a",
  availableSpecialists: [
    {
      id: "frontend",
      role: "Frontend",
      objective: "Analyze UI",
      authority: { repositoryAccess: "read", shellExecution: false },
    },
  ],
  contextAccessPolicy: { allowedScopes: [{ kind: "file", path: "a.ts" }] },
  limits: {
    maxFilesPerRequest: 1,
    maxTotalFiles: 1,
    maxFileBytes: 4096,
    maxContextBytes: 20000,
    maxFileTreeEntries: 10,
  },
  maxAgentInvocations: 1,
};

const proposal: StaffingProposal = {
  id: "proposal-1",
  goal,
  snapshot: { repositoryRoot: "/repository", commitSha: "abc" },
  intent: {
    problem: "UI",
    desiredOutcome: "Analysis",
    considerations: [],
    uncertainties: [],
  },
  assignments: [
    {
      assignmentId: "assignment-1",
      specialistId: "frontend",
      objective: "Review UI",
      contextPaths: ["a.ts"],
      rationale: "Frontend expertise",
    },
  ],
  budget: { maxAgentInvocations: 1 },
  rationale: "Independent analysis",
};
const proposed: StaffingRunResult = { status: "proposed", proposal, rounds: 1 };
const required = {
  status: "approval-required" as const,
  kind: "staffing" as const,
  binding: "approval-binding",
  subject: proposal,
  reason: "Human confirmation required",
};

beforeEach(() => {
  vi.resetAllMocks();
  vi.mocked(runStaffing).mockResolvedValue(proposed);
  vi.mocked(approveStaffingProposal).mockReturnValue(required);
});

describe("Phase A Staffing and Approval Graph", () => {
  it("keeps Organization inputs separate from Phase A results and reuses Governance result types", () => {
    expect(Object.keys(developmentOrganizationState.fields)).toEqual([
      "goal",
      "repositoryPath",
    ]);
    expectTypeOf<
      NonNullable<PhaseAState["policyLookup"]>
    >().toEqualTypeOf<StaffingSystemPolicyResult>();
  });

  it("compiles and invokes policy → Staffing → approval-required without completing Phase A", async () => {
    vi.mocked(getStaffingSystemPolicy).mockReturnValue({
      status: "ready",
      configuration: systemPolicy,
      version: 2,
    });
    const result = await createPhaseAGraph().invoke({
      goal,
      repositoryPath: "/repository",
    });
    expect(getStaffingSystemPolicy).toHaveBeenCalledExactlyOnceWith(
      "/repository"
    );
    expect(result).toMatchObject({
      goal,
      repositoryPath: "/repository",
      policyLookup: {
        status: "ready",
        configuration: systemPolicy,
        version: 2,
      },
    });
    expect(result.policyLookup).not.toHaveProperty("reason");
    expect(runStaffing).toHaveBeenCalledExactlyOnceWith({
      goal,
      systemPolicy,
      maxRounds: 4,
      timeoutMs: undefined,
      agent: undefined,
    });
    expect(approveStaffingProposal).toHaveBeenCalledExactlyOnceWith(proposal);
    expect(result.staffingResult).toEqual(proposed);
    expect(result.approvalResult).toEqual(required);
    expect(authorizeSpecialistInvocation).not.toHaveBeenCalled();
    expect(claimAuthorizedInvocation).not.toHaveBeenCalled();
  });

  it("reports Governance denial and clears policy data supplied by a caller", async () => {
    vi.mocked(getStaffingSystemPolicy).mockReturnValue({
      status: "denied",
      reason: "System Policy unavailable",
    });
    const result = await createPhaseAGraph().invoke({
      goal,
      repositoryPath: "/repository",
      policyLookup: {
        status: "ready",
        configuration: systemPolicy,
        version: 1,
      },
    });
    expect(result).toMatchObject({
      goal,
      repositoryPath: "/repository",
      policyLookup: { status: "denied", reason: "System Policy unavailable" },
    });
    expect(result.policyLookup).not.toHaveProperty("configuration");
    expect(result.policyLookup).not.toHaveProperty("version");
    expect(getStaffingSystemPolicy).toHaveBeenCalledTimes(1);
    expect(runStaffing).not.toHaveBeenCalled();
    expect(approveStaffingProposal).not.toHaveBeenCalled();
    expect(result.staffingResult).toBeUndefined();
    expect(result.approvalResult).toBeUndefined();
  });

  it("rejects a blank Repository path without consulting Governance", async () => {
    const result = await createPhaseAGraph().invoke({
      goal,
      repositoryPath: "   ",
    });
    expect(result.policyLookup).toEqual({
      status: "denied",
      reason: "Repository path is required.",
    });
    expect(getStaffingSystemPolicy).not.toHaveBeenCalled();
    expect(runStaffing).not.toHaveBeenCalled();
    expect(approveStaffingProposal).not.toHaveBeenCalled();
  });

  it("keeps invocations isolated and reloads policy rather than trusting previous State", async () => {
    vi.mocked(getStaffingSystemPolicy)
      .mockReturnValueOnce({
        status: "ready",
        configuration: systemPolicy,
        version: 1,
      })
      .mockReturnValueOnce({
        status: "denied",
        reason: "Policy no longer available",
      });
    const graph = createPhaseAGraph();
    const first = await graph.invoke({
      goal,
      repositoryPath: "/repository",
      policyLookup: { status: "denied", reason: "Old failure" },
    });
    expect(first.policyLookup).toEqual({
      status: "ready",
      configuration: systemPolicy,
      version: 1,
    });
    const second = await graph.invoke(first);
    expect(second.policyLookup).toEqual({
      status: "denied",
      reason: "Policy no longer available",
    });
    expect(second.policyLookup).not.toHaveProperty("configuration");
    expect(second.policyLookup).not.toHaveProperty("version");
    expect(getStaffingSystemPolicy).toHaveBeenCalledTimes(2);
    expect(runStaffing).toHaveBeenCalledTimes(1);
    expect(approveStaffingProposal).toHaveBeenCalledTimes(1);
    expect(second.staffingResult).toBeUndefined();
    expect(second.approvalResult).toBeUndefined();
  });
  it.each(["failed", "escalated"] as const)(
    "stops after Staffing %s and clears previous Approval state",
    async (status) => {
      vi.mocked(getStaffingSystemPolicy).mockReturnValue({
        status: "ready",
        configuration: systemPolicy,
        version: 1,
      });
      const result: StaffingRunResult =
        status === "failed"
          ? {
              status,
              failure: "agent-process",
              reason: "CEO failed",
              rounds: 0,
            }
          : {
              status,
              reason: "Need guidance",
              questions: ["Which UI?"],
              rounds: 1,
            };
      vi.mocked(runStaffing).mockResolvedValue(result);
      const state = await createPhaseAGraph().invoke({
        goal,
        repositoryPath: "/repository",
        staffingResult: proposed,
        approvalResult: required,
      });
      expect(state.staffingResult).toEqual(result);
      expect(state.approvalResult).toBeUndefined();
      expect(runStaffing).toHaveBeenCalledTimes(1);
      expect(approveStaffingProposal).not.toHaveBeenCalled();
    }
  );

  it.each(["denied", "configured", "wrong-kind"])(
    "does not treat %s Approval as success",
    async (kind) => {
      vi.mocked(getStaffingSystemPolicy).mockReturnValue({
        status: "ready",
        configuration: systemPolicy,
        version: 1,
      });
      vi.mocked(approveStaffingProposal).mockReturnValue(
        kind === "configured"
          ? { status: "configured", version: 2 }
          : kind === "wrong-kind"
            ? { ...required, kind: "system-policy" }
            : { status: "denied", reason: "Approval denied" }
      );
      const state = await createPhaseAGraph().invoke({
        goal,
        repositoryPath: "/repository",
      });
      expect(state.staffingResult).toEqual(proposed);
      expect(state.approvalResult).toEqual({
        status: "denied",
        reason:
          kind === "denied"
            ? "Approval denied"
            : "Unexpected Staffing approval result.",
      });
      expect(runStaffing).toHaveBeenCalledTimes(1);
      expect(approveStaffingProposal).toHaveBeenCalledTimes(1);
    }
  );

  it("keeps execution options outside State and does not retry a thrown Staffing failure", async () => {
    vi.mocked(getStaffingSystemPolicy).mockReturnValue({
      status: "ready",
      configuration: systemPolicy,
      version: 1,
    });
    vi.mocked(runStaffing).mockRejectedValueOnce(
      new Error("Unexpected CEO failure")
    );
    const agent = vi.fn();
    await expect(
      createPhaseAGraph({ maxRounds: 2, timeoutMs: 1000, agent }).invoke({
        goal,
        repositoryPath: "/repository",
      })
    ).rejects.toThrow("Unexpected CEO failure");
    expect(runStaffing).toHaveBeenCalledExactlyOnceWith({
      goal,
      systemPolicy,
      maxRounds: 2,
      timeoutMs: 1000,
      agent,
    });
    expect(approveStaffingProposal).not.toHaveBeenCalled();
  });
});
