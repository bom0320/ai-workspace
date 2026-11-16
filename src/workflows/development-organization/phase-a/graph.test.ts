import { beforeEach, describe, expect, expectTypeOf, it, vi } from "vitest";
import {
  getStaffingSystemPolicy,
  type StaffingSystemPolicy,
  type StaffingApprovalResult,
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
import { createPhaseAGraph } from "./graph.js";
import {
  phaseAState,
  type PhaseAState,
  type StaffingApprovalStageResult,
} from "./state.js";
import type { StaffingApprovalWorkflowResult } from "./entrypoints/run-staffing-approval.js";
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

describe("Phase A Staffing Approval execution", () => {
  it("registers Phase A Nodes directly and collects every terminal branch", () => {
    const graph = createPhaseAGraph().getGraph();
    expect(Object.keys(graph.nodes).sort()).toEqual([
      "__end__",
      "__start__",
      "collect-staffing-approval-result",
      "confirm-staffing-approval",
      "evaluate-staffing-approval",
      "load-system-policy",
      "run-staffing",
    ]);
    const edges = graph.edges.map(({ source, target }) => [source, target]);
    expect(edges).toEqual(
      expect.arrayContaining([
        ["__start__", "load-system-policy"],
        ["load-system-policy", "run-staffing"],
        ["load-system-policy", "collect-staffing-approval-result"],
        ["run-staffing", "evaluate-staffing-approval"],
        ["run-staffing", "collect-staffing-approval-result"],
        ["evaluate-staffing-approval", "confirm-staffing-approval"],
        ["evaluate-staffing-approval", "collect-staffing-approval-result"],
        ["confirm-staffing-approval", "collect-staffing-approval-result"],
        ["collect-staffing-approval-result", "__end__"],
      ])
    );
  });

  it("keeps Organization inputs separate from Phase A stage state", () => {
    expect(Object.keys(developmentOrganizationState.fields)).toEqual([
      "goal",
      "repositoryPath",
    ]);
    expect(Object.keys(phaseAState.fields).sort()).toEqual([
      "approvalResult",
      "goal",
      "policyLookup",
      "repositoryPath",
      "staffingApprovalResult",
      "staffingResult",
    ]);
    expectTypeOf<
      NonNullable<PhaseAState["policyLookup"]>
    >().toEqualTypeOf<StaffingSystemPolicyResult>();
    expectTypeOf<StaffingApprovalStageResult>().toExtend<StaffingApprovalWorkflowResult>();
  });

  it("executes policy → Staffing → pending approval once and records stage state", async () => {
    vi.mocked(getStaffingSystemPolicy).mockReturnValue({
      status: "ready",
      configuration: systemPolicy,
      version: 2,
    });
    const result = await createPhaseAGraph().invoke({
      goal,
      repositoryPath: "/repository",
    });
    expect(result).toEqual({
      goal,
      repositoryPath: "/repository",
      policyLookup: {
        status: "ready",
        configuration: systemPolicy,
        version: 2,
      },
      staffingResult: proposed,
      approvalResult: required,
      staffingApprovalResult: {
        status: "approval-required",
        request: required,
      },
    });
    expect(getStaffingSystemPolicy).toHaveBeenCalledExactlyOnceWith(
      "/repository"
    );
    expect(runStaffing).toHaveBeenCalledExactlyOnceWith({
      goal,
      systemPolicy,
      maxRounds: 4,
      timeoutMs: undefined,
      agent: undefined,
    });
    expect(approveStaffingProposal).toHaveBeenCalledExactlyOnceWith(proposal);
    expect(authorizeSpecialistInvocation).not.toHaveBeenCalled();
    expect(claimAuthorizedInvocation).not.toHaveBeenCalled();
  });

  it("denies unavailable policy without Staffing, even when caller supplies stale internal results", async () => {
    vi.mocked(getStaffingSystemPolicy).mockReturnValue({
      status: "denied",
      reason: "System Policy unavailable",
    });
    const input = {
      goal,
      repositoryPath: "/repository",
      policyLookup: {
        status: "ready" as const,
        configuration: systemPolicy,
        version: 1,
      },
      staffingResult: proposed,
      approvalResult: required,
      staffingApprovalResult: {
        status: "approval-required" as const,
        request: required,
      },
    };
    const result = await createPhaseAGraph().invoke(input);
    expect(result).toMatchObject({
      goal,
      repositoryPath: "/repository",
      policyLookup: { status: "denied", reason: "System Policy unavailable" },
      staffingApprovalResult: {
        status: "failed",
        failure: "system-policy",
        reason: "System Policy unavailable",
        rounds: 0,
      },
    });
    expect(result.staffingResult).toBeUndefined();
    expect(result.approvalResult).toBeUndefined();
    expect(result.policyLookup).not.toHaveProperty("configuration");
    expect(getStaffingSystemPolicy).toHaveBeenCalledTimes(1);
    expect(runStaffing).not.toHaveBeenCalled();
    expect(approveStaffingProposal).not.toHaveBeenCalled();
  });

  it("rejects a blank Repository path before Governance", async () => {
    const result = await createPhaseAGraph().invoke({
      goal,
      repositoryPath: "   ",
    });
    expect(result.staffingApprovalResult).toEqual({
      status: "failed",
      failure: "system-policy",
      reason: "Repository path is required.",
      rounds: 0,
    });
    expect(getStaffingSystemPolicy).not.toHaveBeenCalled();
    expect(runStaffing).not.toHaveBeenCalled();
    expect(approveStaffingProposal).not.toHaveBeenCalled();
  });

  it("reloads policy on a fresh invoke and replaces a previous outcome", async () => {
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
    const first = await graph.invoke({ goal, repositoryPath: "/repository" });
    expect(first.staffingApprovalResult).toEqual({
      status: "approval-required",
      request: required,
    });
    const second = await graph.invoke(first);
    expect(second.staffingApprovalResult).toEqual({
      status: "failed",
      failure: "system-policy",
      reason: "Policy no longer available",
      rounds: 0,
    });
    expect(getStaffingSystemPolicy).toHaveBeenCalledTimes(2);
    expect(runStaffing).toHaveBeenCalledTimes(1);
    expect(approveStaffingProposal).toHaveBeenCalledTimes(1);
  });

  it.each(["failed", "escalated"] as const)(
    "stops after Staffing %s",
    async (status) => {
      vi.mocked(getStaffingSystemPolicy).mockReturnValue({
        status: "ready",
        configuration: systemPolicy,
        version: 1,
      });
      const staffingResult: StaffingRunResult =
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
      vi.mocked(runStaffing).mockResolvedValue(staffingResult);
      const input = {
        goal,
        repositoryPath: "/repository",
        staffingResult: proposed,
        approvalResult: required,
      };
      const result = await createPhaseAGraph().invoke(input);
      expect(result.staffingApprovalResult).toEqual(staffingResult);
      expect(result.approvalResult).toBeUndefined();
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
      const result = await createPhaseAGraph().invoke({
        goal,
        repositoryPath: "/repository",
      });
      expect(result.staffingApprovalResult).toEqual({
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

  it("keeps execution options outside State and does not retry Staffing exceptions", async () => {
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
  it.each(["reject", "throw"])(
    "preserves Human %s without final approval or retries",
    async (mode) => {
      vi.mocked(getStaffingSystemPolicy).mockReturnValue({
        status: "ready",
        configuration: systemPolicy,
        version: 1,
      });
      const confirmApproval = vi.fn(
        async (
          request: Extract<
            StaffingApprovalResult,
            { status: "approval-required" }
          >
        ) => {
          expect(request).toEqual(required);
          if (request.subject && "goal" in request.subject)
            request.subject.goal.constraints = ["UI mutation"];
          if (mode === "throw") throw new Error("private error");
          return null;
        }
      );
      const result = await createPhaseAGraph({ confirmApproval }).invoke({
        goal,
        repositoryPath: "/repository",
      });
      expect(result.staffingApprovalResult).toEqual(
        mode === "reject"
          ? {
              status: "rejected",
              reason:
                "Human rejected staffing or confirmation was unavailable.",
            }
          : {
              status: "failed",
              failure: "confirmation",
              reason: "Human Staffing confirmation failed.",
              rounds: 1,
            }
      );
      expect(confirmApproval).toHaveBeenCalledTimes(1);
      expect(runStaffing).toHaveBeenCalledTimes(1);
      expect(approveStaffingProposal).toHaveBeenCalledTimes(1);
      expect(proposal.goal.constraints).toEqual(["No edits"]);
      expect(result).not.toHaveProperty("confirmApproval");
    }
  );
});
