import { beforeEach, describe, expect, it, vi } from "vitest";
import * as governance from "@/application/governance/index.js";
import { compareDecisions } from "@/application/comparison/index.js";
import type { AgentDecision } from "@/application/decision/index.js";
import {
  runAuthorizedSpecialistDecision,
  InvocationClaimError,
} from "./authorized-specialist-decision.js";
import { runSpecialistDecisions } from "./specialist-decisions.js";

vi.mock("@/application/governance/index.js", async (original) => ({
  ...(await original<typeof governance>()),
  getApprovedStaffingScope: vi.fn(),
  authorizeSpecialistInvocation: vi.fn(),
}));
vi.mock("@/application/comparison/index.js", () => ({
  compareDecisions: vi.fn(),
}));
vi.mock("./authorized-specialist-decision.js", async (original) => ({
  ...(await original<typeof import("./authorized-specialist-decision.js")>()),
  runAuthorizedSpecialistDecision: vi.fn(),
}));
const scope: governance.ApprovedOperatingScope = {
  id: "scope",
  version: 1,
  proposalId: "proposal",
  approvalRecordId: "approval",
  policyVersion: "system:1",
  goal: {
    objective: "Review",
    targetRepository: "repo",
    constraints: ["No edits"],
  },
  snapshot: { repositoryRoot: "/repo", commitSha: "abc" },
  assignments: ["frontend", "ux", "security"].map((specialistId, index) => ({
    assignmentId: `a${index}`,
    specialistId,
    objective: `Review ${specialistId}`,
    contextPaths: [`${index}.ts`],
  })),
  budget: { maxAgentInvocations: 3 },
};
const requests = () =>
  scope.assignments.map((assignment) => ({
    scopeId: scope.id,
    scopeVersion: scope.version,
    assignmentId: assignment.assignmentId,
    requestedContextPaths: [...assignment.contextPaths],
  }));
function invocation(
  request: governance.InvokeSpecialistRequest
): governance.AuthorizedSpecialistInvocation {
  const assignment = scope.assignments.find(
    (assignment) => assignment.assignmentId === request.assignmentId
  )!;
  return {
    invocationId: `inv-${assignment.assignmentId}`,
    scopeId: scope.id,
    scopeVersion: scope.version,
    assignmentId: assignment.assignmentId,
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
function decision(id: string): AgentDecision {
  return {
    specialistId: id,
    recommendation: id,
    evidence: [],
    risks: [],
    uncertainty: [],
  };
}
beforeEach(() => {
  vi.resetAllMocks();
  vi.mocked(governance.getApprovedStaffingScope).mockReturnValue({
    status: "approved",
    scope: structuredClone(scope),
    approval: {} as governance.ApprovalRecord,
  });
  vi.mocked(governance.authorizeSpecialistInvocation).mockImplementation(
    (request) => ({
      status: "allowed",
      invocation: invocation(request as governance.InvokeSpecialistRequest),
    })
  );
  vi.mocked(runAuthorizedSpecialistDecision).mockImplementation(async (input) =>
    decision(input.specialist.id)
  );
  vi.mocked(compareDecisions).mockResolvedValue({ findings: [], gaps: [] });
});
describe("Phase A dynamic Specialist Decisions", () => {
  it("awaits each Decision before the next Authorization, then compares original sources", async () => {
    const events: string[] = [];
    let finish!: (decision: AgentDecision) => void;
    vi.mocked(governance.authorizeSpecialistInvocation).mockImplementation(
      (raw) => {
        const request = raw as governance.InvokeSpecialistRequest;
        events.push(`authorize:${request.assignmentId}`);
        return { status: "allowed", invocation: invocation(request) };
      }
    );
    vi.mocked(runAuthorizedSpecialistDecision)
      .mockImplementationOnce((input) => {
        events.push(`decision:${input.specialist.id}`);
        return new Promise((resolve) => {
          finish = resolve;
        });
      })
      .mockImplementation(async (input) => {
        events.push(`decision:${input.specialist.id}`);
        return decision(input.specialist.id);
      });
    const run = runSpecialistDecisions({
      scopeId: scope.id,
      requests: requests(),
    });
    expect(events).toEqual(["authorize:a0", "decision:frontend"]);
    finish(decision("frontend"));
    const result = await run;
    expect(result.status).toBe("completed");
    expect(events).toEqual([
      "authorize:a0",
      "decision:frontend",
      "authorize:a1",
      "decision:ux",
      "authorize:a2",
      "decision:security",
    ]);
    for (const [index, [input]] of vi
      .mocked(runAuthorizedSpecialistDecision)
      .mock.calls.entries()) {
      expect(input.assignmentObjective).toBe(
        scope.assignments[index].objective
      );
      expect(input.files.map(({ path }) => path)).toEqual(
        scope.assignments[index].contextPaths
      );
      expect(input.goal).toEqual(scope.goal);
      expect(input.snapshot).toEqual(scope.snapshot);
    }
    expect(compareDecisions).toHaveBeenCalledExactlyOnceWith({
      goal: scope.goal,
      repositoryCommitSha: scope.snapshot.commitSha,
      decisions: scope.assignments.map(({ specialistId }) =>
        decision(specialistId)
      ),
    });
    if (result.status !== "completed") throw new Error("Expected completion");
    expect(vi.mocked(compareDecisions).mock.calls[0][0].decisions).toBe(
      result.decisions
    );
  });
  it.each([
    "empty",
    "sparse",
    "scope",
    "version",
    "assignment",
    "duplicate-assignment",
    "duplicate-specialist",
    "malformed",
    "unapproved",
  ])("rejects %s preflight before reserving anything", async (kind) => {
    const input = { scopeId: scope.id, requests: requests() };
    if (kind === "empty") input.requests = [];
    if (kind === "sparse") input.requests.length = 4;
    if (kind === "scope") input.requests[1].scopeId = "other";
    if (kind === "version") input.requests[1].scopeVersion++;
    if (kind === "assignment") input.requests[1].assignmentId = "other";
    if (kind === "duplicate-assignment")
      input.requests[1] = structuredClone(input.requests[0]);
    if (kind === "duplicate-specialist") {
      const duplicate = structuredClone(scope);
      duplicate.assignments[1].specialistId =
        duplicate.assignments[0].specialistId;
      vi.mocked(governance.getApprovedStaffingScope).mockReturnValue({
        status: "approved",
        scope: duplicate,
        approval: {} as governance.ApprovalRecord,
      });
    }
    if (kind === "malformed") input.requests[1].requestedContextPaths = [];
    if (kind === "unapproved")
      vi.mocked(governance.getApprovedStaffingScope).mockReturnValue({
        status: "denied",
        reason: "No approval",
      });
    expect(await runSpecialistDecisions(input)).toMatchObject({
      status: "failed",
      stage: "preflight",
      reason: expect.any(String),
    });
    expect(governance.authorizeSpecialistInvocation).not.toHaveBeenCalled();
    expect(runAuthorizedSpecialistDecision).not.toHaveBeenCalled();
    expect(compareDecisions).not.toHaveBeenCalled();
  });
  it("detaches all requests before asynchronous execution", async () => {
    const input = { scopeId: scope.id, requests: requests() };
    vi.mocked(runAuthorizedSpecialistDecision).mockImplementationOnce(
      async (value) => {
        input.requests[1].assignmentId = "tampered";
        input.requests[1].requestedContextPaths.push("unapproved.ts");
        return decision(value.specialist.id);
      }
    );
    expect((await runSpecialistDecisions(input)).status).toBe("completed");
    expect(governance.authorizeSpecialistInvocation).toHaveBeenNthCalledWith(
      2,
      requests()[1]
    );
  });
  it("stops on Authorization denial without executing or comparing later Assignments", async () => {
    vi.mocked(governance.authorizeSpecialistInvocation)
      .mockReturnValueOnce({
        status: "allowed",
        invocation: invocation(requests()[0]),
      })
      .mockReturnValueOnce({ status: "denied", reason: "No budget" });
    expect(
      await runSpecialistDecisions({ scopeId: scope.id, requests: requests() })
    ).toEqual({
      status: "failed",
      stage: "authorization",
      reason: "No budget",
      assignmentId: "a1",
    });
    expect(governance.authorizeSpecialistInvocation).toHaveBeenCalledTimes(2);
    expect(runAuthorizedSpecialistDecision).toHaveBeenCalledTimes(1);
    expect(compareDecisions).not.toHaveBeenCalled();
  });
  it.each(["claim", "decision"] as const)(
    "identifies %s without inspecting error messages and stops the batch",
    async (stage) => {
      const error =
        stage === "claim"
          ? new InvocationClaimError("opaque denial")
          : new Error(
              "Invocation claim denied: this is still a Decision error"
            );
      vi.mocked(runAuthorizedSpecialistDecision).mockRejectedValueOnce(error);
      expect(
        await runSpecialistDecisions({
          scopeId: scope.id,
          requests: requests(),
        })
      ).toEqual({
        status: "failed",
        stage,
        reason: error.message,
        assignmentId: "a0",
      });
      expect(governance.authorizeSpecialistInvocation).toHaveBeenCalledTimes(1);
      expect(compareDecisions).not.toHaveBeenCalled();
    }
  );
  it("returns a single Decision without Comparison", async () => {
    expect(
      await runSpecialistDecisions({
        scopeId: scope.id,
        requests: requests().slice(0, 1),
      })
    ).toEqual({ status: "completed", decisions: [decision("frontend")] });
    expect(compareDecisions).not.toHaveBeenCalled();
  });
  it("reports Comparison failure without exposing a partial success result", async () => {
    vi.mocked(compareDecisions).mockRejectedValueOnce(
      new Error("Invalid reference")
    );
    expect(
      await runSpecialistDecisions({ scopeId: scope.id, requests: requests() })
    ).toEqual({
      status: "failed",
      stage: "comparison",
      reason: "Invalid reference",
    });
    expect(runAuthorizedSpecialistDecision).toHaveBeenCalledTimes(3);
  });
});
