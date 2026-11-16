import { beforeEach, describe, expect, expectTypeOf, it, vi } from "vitest";
import {
  getStaffingSystemPolicy,
  getApprovedStaffingScope,
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
import { createPhaseAGraph } from "../graph.js";
import { completeSpecialistDecisions } from "../features/decision/nodes/complete-specialist-decisions.js";
import { compareSpecialistDecisions } from "../features/comparison/nodes/compare-specialist-decisions.js";
import {
  phaseAState,
  type PhaseAState,
  type StaffingApprovalStageResult,
  type DecisionComparisonStageResult,
} from "../state.js";
import type { StaffingApprovalWorkflowResult } from "../entrypoints/run-staffing-approval.js";
import { developmentOrganizationState } from "../../state.js";
import type { SpecialistDecisionsWorkflowResult } from "../state.js";
import {
  runAuthorizedSpecialistDecision,
  InvocationClaimError,
} from "../features/decision/execution/authorized-specialist-decision.js";
import { compareDecisions } from "@/application/comparison/index.js";
import type {
  AuthorizedSpecialistInvocation,
  InvokeSpecialistRequest,
} from "@/application/governance/index.js";
vi.mock(
  "../features/decision/execution/authorized-specialist-decision.js",
  async (original) => ({
    ...(await original<
      typeof import("../features/decision/execution/authorized-specialist-decision.js")
    >()),
    runAuthorizedSpecialistDecision: vi.fn(),
  })
);
vi.mock("@/application/comparison/index.js", async (original) => ({
  ...(await original<typeof import("@/application/comparison/index.js")>()),
  compareDecisions: vi.fn(),
}));

vi.mock("@/application/governance/index.js", async (original) => ({
  ...(await original<typeof import("@/application/governance/index.js")>()),
  getStaffingSystemPolicy: vi.fn(),
  getApprovedStaffingScope: vi.fn(),
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
      "compare-specialist-decisions",
      "complete-specialist-decisions",
      "confirm-staffing-approval",
      "evaluate-staffing-approval",
      "execute-next-specialist",
      "load-system-policy",
      "preflight-specialist-decisions",
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
        ["preflight-specialist-decisions", "execute-next-specialist"],
        ["execute-next-specialist", "execute-next-specialist"],
        ["complete-specialist-decisions", "compare-specialist-decisions"],
        ["compare-specialist-decisions", "__end__"],
        ["execute-next-specialist", "complete-specialist-decisions"],
        ["complete-specialist-decisions", "__end__"],
      ])
    );
    expect(edges).not.toContainEqual([
      "execute-next-specialist",
      "compare-specialist-decisions",
    ]);
    expect(edges).not.toContainEqual([
      "compare-specialist-decisions",
      "complete-specialist-decisions",
    ]);
  });

  it("keeps Organization inputs separate from Phase A stage state", () => {
    expect(Object.keys(developmentOrganizationState.fields)).toEqual([
      "goal",
      "repositoryPath",
    ]);
    expect(Object.keys(phaseAState.fields).sort()).toEqual([
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
      "staffingApprovalResult",
      "staffingResult",
    ]);
    expectTypeOf<
      NonNullable<PhaseAState["policyLookup"]>
    >().toEqualTypeOf<StaffingSystemPolicyResult>();
    expectTypeOf<StaffingApprovalStageResult>().toExtend<StaffingApprovalWorkflowResult>();
    expectTypeOf<
      NonNullable<PhaseAState["specialistDecisionsResult"]>
    >().toEqualTypeOf<SpecialistDecisionsWorkflowResult>();
    expectTypeOf<
      NonNullable<PhaseAState["decisionComparisonResult"]>
    >().toEqualTypeOf<DecisionComparisonStageResult>();
    expect(
      phaseAState.fields.specialistDecisionsResult.safeParse({
        status: "completed",
        decisions: [],
      }).success
    ).toBe(false);
    expect(
      phaseAState.fields.specialistDecisionsResult.safeParse({
        status: "completed",
        decisions: [
          {
            specialistId: "frontend",
            recommendation: "Review",
            evidence: [],
            risks: [],
            uncertainty: [],
          },
        ],
        comparison: { findings: [], gaps: [] },
      }).success
    ).toBe(false);
    expect(
      phaseAState.fields.specialistDecisionsResult.safeParse({
        status: "failed",
        stage: "comparison",
        reason: "Invalid reference",
      }).success
    ).toBe(false);
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

const approved: Extract<StaffingApprovalResult, { status: "approved" }> = {
  status: "approved",
  approval: {
    id: "approval",
    proposalId: proposal.id,
    proposalDigest: "digest",
    approvedAt: "2026-11-16T00:00:00.000Z",
    systemPolicyVersion: 1,
    source: {
      type: "human-delegation",
      delegationPolicyId: "delegation",
      delegationPolicyVersion: 1,
      delegationApprovalId: "delegation-approval",
    },
  },
  scope: {
    id: "scope",
    version: 1,
    proposalId: proposal.id,
    approvalRecordId: "approval",
    policyVersion: "system:1",
    goal,
    snapshot: proposal.snapshot,
    assignments: proposal.assignments.map(
      ({ assignmentId, specialistId, objective, contextPaths }) => ({
        assignmentId,
        specialistId,
        objective,
        contextPaths,
      })
    ),
    budget: proposal.budget,
  },
};
const completed: SpecialistDecisionsWorkflowResult = {
  status: "completed",
  decisions: [
    {
      specialistId: "frontend",
      recommendation: "Review UI",
      evidence: [],
      risks: [],
      uncertainty: [],
    },
  ],
};

function authorizePrepared(raw: unknown): AuthorizedSpecialistInvocation {
  const request = raw as InvokeSpecialistRequest;
  const stored = vi.mocked(getApprovedStaffingScope).mock.results.at(-1)!.value;
  const scope = stored.scope;
  const assignment = scope.assignments.find(
    (a: { assignmentId: string }) => a.assignmentId === request.assignmentId
  )!;
  return {
    invocationId: `inv-${request.assignmentId}`,
    scopeId: scope.id,
    scopeVersion: scope.version,
    assignmentId: request.assignmentId,
    assignmentObjective: assignment.objective,
    goal: scope.goal,
    snapshot: scope.snapshot,
    specialist: {
      id: assignment.specialistId,
      role: assignment.specialistId,
      objective: "Default role",
      authority: { repositoryAccess: "read", shellExecution: false },
    },
    files: request.requestedContextPaths.map((path) => ({
      path,
      content: path,
    })),
  };
}
function twoAssignments() {
  const stored = structuredClone(approved);
  stored.scope.assignments.push({
    assignmentId: "assignment-2",
    specialistId: "ux",
    objective: "Assess interactions",
    contextPaths: ["b.ts", "c.ts"],
  });
  vi.mocked(getApprovedStaffingScope).mockReturnValue(stored);
  return stored;
}
const specialistInput = { goal, repositoryPath: "/repository" };
const specialistOptions = { executionTarget: "specialist-decisions" as const };

describe("Phase A Specialist execution Nodes and Edges", () => {
  beforeEach(() => {
    vi.mocked(getStaffingSystemPolicy).mockReturnValue({
      status: "ready",
      configuration: systemPolicy,
      version: 1,
    });
    vi.mocked(approveStaffingProposal).mockReturnValue(
      structuredClone(approved)
    );
    vi.mocked(getApprovedStaffingScope).mockReturnValue(
      structuredClone(approved)
    );
    vi.mocked(authorizeSpecialistInvocation).mockImplementation((raw) => ({
      status: "allowed",
      invocation: authorizePrepared(raw),
    }));
    vi.mocked(runAuthorizedSpecialistDecision).mockImplementation(
      async (invocation) => ({
        specialistId: invocation.specialist.id,
        recommendation: invocation.assignmentObjective,
        evidence: [],
        risks: [],
        uncertainty: [],
      })
    );
    vi.mocked(compareDecisions).mockResolvedValue({ findings: [], gaps: [] });
  });

  it.each([undefined, "staffing-approval"] as const)(
    "stops at Staffing Approval for target %s",
    async (executionTarget) => {
      const state = await createPhaseAGraph({ executionTarget }).invoke(
        specialistInput
      );
      expect(state.staffingApprovalResult?.status).toBe("approved");
      expect(state.specialistDecisionsResult).toBeUndefined();
      expect(state.decisionComparisonResult).toBeUndefined();
      expect(getApprovedStaffingScope).not.toHaveBeenCalled();
      expect(authorizeSpecialistInvocation).not.toHaveBeenCalled();
      expect(state.decisionComparisonResult).toBeUndefined();
      expect(compareDecisions).not.toHaveBeenCalled();
      expect(state.decisionComparisonResult).toBeUndefined();
    }
  );
  it.each([
    "approval-required",
    "denied",
    "rejected",
    "failed",
    "escalated",
  ] as const)("does not execute Specialists after %s", async (status) => {
    if (status === "failed")
      vi.mocked(runStaffing).mockResolvedValue({
        status,
        failure: "agent-process",
        reason: "CEO failed",
        rounds: 1,
      });
    else if (status === "escalated")
      vi.mocked(runStaffing).mockResolvedValue({
        status,
        reason: "Need Human",
        questions: ["Which UI?"],
        rounds: 1,
      });
    else
      vi.mocked(approveStaffingProposal).mockReturnValue(
        status === "denied" ? { status, reason: "Denied" } : required
      );
    const state = await createPhaseAGraph({
      ...specialistOptions,
      confirmApproval: status === "rejected" ? () => null : undefined,
    }).invoke(specialistInput);
    expect(state.staffingApprovalResult?.status).toBe(status);
    expect(state.specialistDecisionsResult).toBeUndefined();
    expect(state.decisionComparisonResult).toBeUndefined();
    expect(getApprovedStaffingScope).not.toHaveBeenCalled();
    expect(runAuthorizedSpecialistDecision).not.toHaveBeenCalled();
  });
  it.each(["missing", "id", "version", "throws"])(
    "blocks %s Scope before reserving",
    async (kind) => {
      if (kind === "missing")
        vi.mocked(getApprovedStaffingScope).mockReturnValue({
          status: "denied",
          reason: "Unavailable",
        });
      else if (kind === "throws")
        vi.mocked(getApprovedStaffingScope).mockImplementation(() => {
          throw new Error("Storage failed");
        });
      else {
        const stored = structuredClone(approved);
        if (kind === "id") stored.scope.id = "other";
        else stored.scope.version++;
        vi.mocked(getApprovedStaffingScope).mockReturnValue(stored);
      }
      const state =
        await createPhaseAGraph(specialistOptions).invoke(specialistInput);
      expect(state.specialistDecisionsResult).toMatchObject({
        status: "failed",
        stage: "preflight",
        reason: expect.any(String),
      });
      expect(authorizeSpecialistInvocation).not.toHaveBeenCalled();
      expect(state.decisionComparisonResult).toBeUndefined();
      expect(compareDecisions).not.toHaveBeenCalled();
      expect(state.decisionComparisonResult).toBeUndefined();
    }
  );
  it.each([
    "empty",
    "sparse",
    "duplicate-assignment",
    "duplicate-specialist",
    "malformed",
  ])(
    "validates the entire %s batch before first Authorization",
    async (kind) => {
      const stored = twoAssignments();
      if (kind === "empty") stored.scope.assignments = [];
      if (kind === "sparse") stored.scope.assignments.length = 3;
      if (kind === "duplicate-assignment")
        stored.scope.assignments[1] = structuredClone(
          stored.scope.assignments[0]
        );
      if (kind === "duplicate-specialist")
        stored.scope.assignments[1].specialistId = "frontend";
      if (kind === "malformed") stored.scope.assignments[1].contextPaths = [];
      const state =
        await createPhaseAGraph(specialistOptions).invoke(specialistInput);
      expect(state.specialistDecisionsResult).toMatchObject({
        status: "failed",
        stage: "preflight",
      });
      if (!["empty", "sparse"].includes(kind))
        expect(state.specialistDecisionsResult).toHaveProperty(
          "assignmentId",
          stored.scope.assignments[1].assignmentId
        );
      expect(authorizeSpecialistInvocation).not.toHaveBeenCalled();
      expect(runAuthorizedSpecialistDecision).not.toHaveBeenCalled();
      expect(compareDecisions).not.toHaveBeenCalled();
      expect(state.decisionComparisonResult).toBeUndefined();
    }
  );
  it("awaits one Specialist per Node before the next Authorization and compares original inputs", async () => {
    const stored = twoAssignments();
    const original = structuredClone(stored.scope);
    const altered = structuredClone(approved);
    altered.scope.assignments[0].contextPaths = ["untrusted.ts"];
    vi.mocked(approveStaffingProposal).mockReturnValue(altered);
    const events: string[] = [];
    vi.mocked(authorizeSpecialistInvocation).mockImplementation((raw) => {
      events.push(`authorize:${(raw as InvokeSpecialistRequest).assignmentId}`);
      return { status: "allowed", invocation: authorizePrepared(raw) };
    });
    let finish!: (
      decision: NonNullable<PhaseAState["collectedDecisions"]>[number]
    ) => void;
    vi.mocked(runAuthorizedSpecialistDecision)
      .mockImplementationOnce((invocation) => {
        events.push(`decision:${invocation.specialist.id}`);
        return new Promise((resolve) => {
          finish = resolve;
        });
      })
      .mockImplementation(async (invocation) => {
        events.push(`decision:${invocation.specialist.id}`);
        return {
          ...completed.decisions[0],
          specialistId: invocation.specialist.id,
          recommendation: invocation.assignmentObjective,
        };
      });
    const run = createPhaseAGraph(specialistOptions).invoke(specialistInput);
    await vi.waitFor(() =>
      expect(events).toEqual(["authorize:assignment-1", "decision:frontend"])
    );
    expect(compareDecisions).not.toHaveBeenCalled();
    // Changes to caller-owned data during execution cannot expand prepared Context.
    stored.scope.assignments[1].contextPaths.push("unapproved.ts");
    finish(completed.decisions[0]);
    const state = await run;
    expect(events).toEqual([
      "authorize:assignment-1",
      "decision:frontend",
      "authorize:assignment-2",
      "decision:ux",
    ]);
    expect(authorizeSpecialistInvocation).toHaveBeenNthCalledWith(2, {
      scopeId: original.id,
      scopeVersion: original.version,
      assignmentId: "assignment-2",
      requestedContextPaths: ["b.ts", "c.ts"],
    });
    for (const [index, [invocation]] of vi
      .mocked(runAuthorizedSpecialistDecision)
      .mock.calls.entries()) {
      expect(invocation.goal).toEqual(original.goal);
      expect(invocation.snapshot).toEqual(original.snapshot);
      expect(invocation.assignmentObjective).toBe(
        original.assignments[index].objective
      );
      expect(invocation.files.map((f) => f.path)).toEqual(
        original.assignments[index].contextPaths
      );
    }
    expect(state.specialistDecisionsResult).toEqual({
      status: "completed",
      decisions: state.collectedDecisions,
    });
    expect(state.decisionComparisonResult).toEqual({
      status: "completed",
      comparison: { findings: [], gaps: [] },
    });
    expect(compareDecisions).toHaveBeenCalledExactlyOnceWith({
      goal: original.goal,
      repositoryCommitSha: original.snapshot.commitSha,
      decisions: state.collectedDecisions,
    });
    expect(state.currentSpecialistIndex).toBe(2);
    expect(claimAuthorizedInvocation).not.toHaveBeenCalled(); // Executor is mocked; Nodes do not duplicate Claim.
    expect(state).not.toHaveProperty("invocation");
  });
  it("executes a finite approved batch beyond LangGraph's default 25 steps", async () => {
    const stored = structuredClone(approved);
    stored.scope.assignments = Array.from({ length: 30 }, (_, index) => ({
      assignmentId: `assignment-${index}`,
      specialistId: `specialist-${index}`,
      objective: `Review ${index}`,
      contextPaths: [`${index}.ts`],
    }));
    stored.scope.budget.maxAgentInvocations = 30;
    vi.mocked(getApprovedStaffingScope).mockReturnValue(stored);
    const state =
      await createPhaseAGraph(specialistOptions).invoke(specialistInput);
    expect(state.specialistDecisionsResult?.status).toBe("completed");
    expect(state.currentSpecialistIndex).toBe(30);
    expect(authorizeSpecialistInvocation).toHaveBeenCalledTimes(30);
    expect(runAuthorizedSpecialistDecision).toHaveBeenCalledTimes(30);
    expect(compareDecisions).toHaveBeenCalledTimes(1);
  });
  it("stops on second Authorization denial and exposes no partial success", async () => {
    twoAssignments();
    vi.mocked(authorizeSpecialistInvocation)
      .mockImplementationOnce((raw) => ({
        status: "allowed",
        invocation: authorizePrepared(raw),
      }))
      .mockReturnValueOnce({ status: "denied", reason: "No budget" });
    const state =
      await createPhaseAGraph(specialistOptions).invoke(specialistInput);
    expect(state.specialistDecisionsResult).toEqual({
      status: "failed",
      stage: "authorization",
      reason: "No budget",
      assignmentId: "assignment-2",
    });
    expect(authorizeSpecialistInvocation).toHaveBeenCalledTimes(2);
    expect(runAuthorizedSpecialistDecision).toHaveBeenCalledTimes(1);
    expect(compareDecisions).not.toHaveBeenCalled();
    expect(state.decisionComparisonResult).toBeUndefined();
    expect(state.collectedDecisions).toEqual([]);
  });
  it.each(["claim", "decision"] as const)(
    "identifies %s by explicit error type and stops without retry",
    async (stage) => {
      twoAssignments();
      const error =
        stage === "claim"
          ? new InvocationClaimError("opaque denial")
          : new Error("Invocation claim denied: still a Decision error");
      vi.mocked(runAuthorizedSpecialistDecision).mockRejectedValueOnce(error);
      const state =
        await createPhaseAGraph(specialistOptions).invoke(specialistInput);
      expect(state.specialistDecisionsResult).toEqual({
        status: "failed",
        stage,
        reason: error.message,
        assignmentId: "assignment-1",
      });
      expect(authorizeSpecialistInvocation).toHaveBeenCalledTimes(1);
      expect(runAuthorizedSpecialistDecision).toHaveBeenCalledTimes(1);
      expect(compareDecisions).not.toHaveBeenCalled();
      expect(state.decisionComparisonResult).toBeUndefined();
      expect(state.collectedDecisions).toEqual([]);
    }
  );
  it("completes a single Decision without Comparison", async () => {
    const state =
      await createPhaseAGraph(specialistOptions).invoke(specialistInput);
    expect(state.specialistDecisionsResult).toEqual(completed);
    expect(state.decisionComparisonResult).toEqual({
      status: "skipped",
      reason: "insufficient-decisions",
    });
    expect(compareDecisions).not.toHaveBeenCalled();
  });
  it.each(["empty", "incomplete"] as const)(
    "does not complete an %s Decision batch",
    async (kind) => {
      const state = await createPhaseAGraph().invoke(specialistInput);
      const result = completeSpecialistDecisions({
        ...state,
        preparedSpecialistRequests: [
          {
            scopeId: "scope",
            scopeVersion: 1,
            assignmentId: "a",
            requestedContextPaths: ["a.ts"],
          },
          {
            scopeId: "scope",
            scopeVersion: 1,
            assignmentId: "b",
            requestedContextPaths: ["b.ts"],
          },
        ],
        currentSpecialistIndex: kind === "empty" ? 0 : 1,
        collectedDecisions: kind === "empty" ? [] : completed.decisions,
      });
      expect(result.specialistDecisionsResult).toMatchObject({
        status: "failed",
        stage: "decision",
      });
      expect(result.collectedDecisions).toEqual([]);
      expect(result.decisionComparisonResult).toBeUndefined();
      expect(compareDecisions).not.toHaveBeenCalled();
      expect(state.decisionComparisonResult).toBeUndefined();
    }
  );
  it("publishes Stage 3 before Stage 4 and compares the completed result", async () => {
    twoAssignments();
    const updates: Array<Record<string, Partial<PhaseAState>>> = [];
    const stream = await createPhaseAGraph(specialistOptions).stream(
      specialistInput,
      { streamMode: "updates" }
    );
    for await (const update of stream) updates.push(update);
    const completionIndex = updates.findIndex(
      (update) => "complete-specialist-decisions" in update
    );
    const comparisonIndex = updates.findIndex(
      (update) => "compare-specialist-decisions" in update
    );
    expect(completionIndex).toBeGreaterThanOrEqual(0);
    expect(comparisonIndex).toBeGreaterThan(completionIndex);
    const result =
      updates[completionIndex]["complete-specialist-decisions"]
        .specialistDecisionsResult;
    expect(result?.status).toBe("completed");
    expect(result).not.toHaveProperty("comparison");
    expect(
      updates[comparisonIndex]["compare-specialist-decisions"]
        .decisionComparisonResult?.status
    ).toBe("completed");
    expect(compareDecisions).toHaveBeenCalledExactlyOnceWith({
      goal,
      repositoryCommitSha: approved.scope.snapshot.commitSha,
      decisions: result?.status === "completed" ? result.decisions : [],
    });
  });
  it("Comparison consumes completed Decisions rather than intermediate collection", async () => {
    const state = await createPhaseAGraph().invoke(specialistInput);
    const decisions = [
      ...completed.decisions,
      { ...completed.decisions[0], specialistId: "ux" },
    ];
    const update = await compareSpecialistDecisions({
      ...state,
      specialistDecisionsResult: { status: "completed", decisions },
      collectedDecisions: [],
      specialistComparisonContext: { goal, repositoryCommitSha: "abc" },
    });
    expect(update.decisionComparisonResult?.status).toBe("completed");
    expect(compareDecisions).toHaveBeenCalledExactlyOnceWith({
      goal,
      repositoryCommitSha: "abc",
      decisions,
    });
    expect(update).not.toHaveProperty("specialistDecisionsResult");
  });
  it("does not reuse a previous successful Comparison when a fresh run fails to compare", async () => {
    twoAssignments();
    vi.mocked(compareDecisions)
      .mockResolvedValueOnce({ findings: [], gaps: [] })
      .mockRejectedValueOnce(new Error("New Comparison failed"));
    const graph = createPhaseAGraph(specialistOptions);
    const first = await graph.invoke(specialistInput);
    expect(first.decisionComparisonResult?.status).toBe("completed");
    const second = await graph.invoke(first);
    expect(second.specialistDecisionsResult?.status).toBe("completed");
    expect(second.collectedDecisions).toHaveLength(2);
    expect(second.decisionComparisonResult).toEqual({
      status: "failed",
      reason: "New Comparison failed",
    });
    expect(authorizeSpecialistInvocation).toHaveBeenCalledTimes(4);
    expect(compareDecisions).toHaveBeenCalledTimes(2);
  });
  it("preserves completed Decisions when Comparison alone fails", async () => {
    twoAssignments();
    vi.mocked(compareDecisions).mockRejectedValueOnce(
      new Error("Invalid reference")
    );
    const state =
      await createPhaseAGraph(specialistOptions).invoke(specialistInput);
    expect(state.specialistDecisionsResult).toEqual({
      status: "completed",
      decisions: state.collectedDecisions,
    });
    expect(state.specialistDecisionsResult).not.toHaveProperty("comparison");
    expect(state.decisionComparisonResult).toEqual({
      status: "failed",
      reason: "Invalid reference",
    });
    expect(runAuthorizedSpecialistDecision).toHaveBeenCalledTimes(2);
    expect(compareDecisions).toHaveBeenCalledTimes(1);
    expect(state.collectedDecisions).toHaveLength(2);
  });
  it.each(["staffing-approval", "specialist-decisions"] as const)(
    "clears all stale execution data for fresh %s execution",
    async (executionTarget) => {
      vi.mocked(getStaffingSystemPolicy).mockReturnValue({
        status: "denied",
        reason: "No policy",
      });
      const state = await createPhaseAGraph({ executionTarget }).invoke({
        ...specialistInput,
        specialistDecisionsResult: completed,
        preparedSpecialistRequests: [
          {
            scopeId: "stale",
            scopeVersion: 1,
            assignmentId: "stale",
            requestedContextPaths: ["stale.ts"],
          },
        ],
        currentSpecialistIndex: 9,
        collectedDecisions: completed.decisions,
        specialistComparisonContext: { goal, repositoryCommitSha: "stale" },
        decisionComparisonResult: {
          status: "completed",
          comparison: { findings: [], gaps: [] },
        },
      });
      for (const key of [
        "preparedSpecialistRequests",
        "currentSpecialistIndex",
        "collectedDecisions",
        "specialistComparisonContext",
        "decisionComparisonResult",
        "specialistDecisionsResult",
      ] as const)
        expect(state[key]).toBeUndefined();
      expect(authorizeSpecialistInvocation).not.toHaveBeenCalled();
      expect(state.decisionComparisonResult).toBeUndefined();
      expect(compareDecisions).not.toHaveBeenCalled();
      expect(state.decisionComparisonResult).toBeUndefined();
    }
  );
});
