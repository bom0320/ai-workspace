import { beforeEach, describe, expect, it, vi } from "vitest";
import * as governance from "@/application/governance/index.js";
import { preflightSpecialistDecisions } from "./preflight-specialist-decisions.js";
vi.mock("@/application/governance/index.js", async (original) => ({
  ...(await original<typeof governance>()),
  getApprovedStaffingScope: vi.fn(),
  authorizeSpecialistInvocation: vi.fn(),
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
beforeEach(() => {
  vi.resetAllMocks();
  vi.mocked(governance.getApprovedStaffingScope).mockReturnValue({
    status: "approved",
    scope: structuredClone(scope),
    approval: {} as governance.ApprovalRecord,
  });
});
describe("Specialist request preflight", () => {
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
    const result = preflightSpecialistDecisions(input);
    expect(result).toMatchObject({
      status: "failed",
      stage: "preflight",
      reason: expect.any(String),
    });
    if (["empty", "sparse", "unapproved"].includes(kind)) {
      expect(result).not.toHaveProperty("assignmentId");
    } else {
      expect(result).toMatchObject({
        assignmentId: input.requests[1].assignmentId,
      });
    }
    expect(governance.authorizeSpecialistInvocation).not.toHaveBeenCalled();
  });
  it("detaches every request before asynchronous execution can begin", () => {
    const input = { scopeId: scope.id, requests: requests() };
    const result = preflightSpecialistDecisions(input);
    if (result.status !== "ready") throw new Error(result.reason);
    input.requests[1].assignmentId = "tampered";
    input.requests[1].requestedContextPaths.push("unapproved.ts");
    expect(result.requests).toEqual(requests());
  });
});
