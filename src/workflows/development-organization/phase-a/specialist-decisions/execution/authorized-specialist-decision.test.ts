import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  claimAuthorizedInvocation,
  type AuthorizedSpecialistInvocation,
} from "@/application/governance/index.js";
import {
  runIndependentDecisions,
  type AgentDecision,
} from "@/application/decision/index.js";
import {
  runAuthorizedSpecialistDecision,
  InvocationClaimError,
} from "../../index.js";

vi.mock("@/application/governance/index.js", () => ({
  claimAuthorizedInvocation: vi.fn(),
}));
vi.mock("@/application/decision/index.js", () => ({
  runIndependentDecisions: vi.fn(),
}));
const invocation: AuthorizedSpecialistInvocation = {
  invocationId: "invocation",
  scopeId: "scope",
  scopeVersion: 1,
  assignmentId: "assignment",
  assignmentObjective: "Assess login accessibility",
  snapshot: { repositoryRoot: "/repo", commitSha: "abc" },
  goal: {
    objective: "Review UI",
    targetRepository: "repo",
    constraints: ["No edits"],
  },
  specialist: {
    id: "ux",
    role: "UX",
    objective: "Review interactions",
    authority: { repositoryAccess: "read", shellExecution: false },
  },
  files: [{ path: "a.ts", content: "UI" }],
};
const decision: AgentDecision = {
  specialistId: "ux",
  recommendation: "Review focus",
  evidence: [],
  risks: [],
  uncertainty: [],
};
beforeEach(() => {
  vi.resetAllMocks();
  vi.mocked(claimAuthorizedInvocation).mockReturnValue({
    status: "claimed",
    invocation,
  });
  vi.mocked(runIndependentDecisions).mockResolvedValue([decision]);
});
describe("Authorized single Specialist Decision", () => {
  it("maps the Claim-returned invocation to one v2 input and returns its validated Decision", async () => {
    const input = structuredClone(invocation);
    input.assignmentObjective = "Caller object must not be used after Claim";
    expect(await runAuthorizedSpecialistDecision(input)).toBe(decision);
    expect(claimAuthorizedInvocation).toHaveBeenCalledExactlyOnceWith(input);
    expect(runIndependentDecisions).toHaveBeenCalledExactlyOnceWith(
      invocation.snapshot,
      invocation.goal,
      [
        {
          specialist: invocation.specialist,
          assignmentObjective: invocation.assignmentObjective,
          files: invocation.files,
        },
      ]
    );
    expect(
      vi.mocked(claimAuthorizedInvocation).mock.invocationCallOrder[0]
    ).toBeLessThan(
      vi.mocked(runIndependentDecisions).mock.invocationCallOrder[0]
    );
  });
  it("never calls v2 when Claim is denied", async () => {
    vi.mocked(claimAuthorizedInvocation).mockReturnValue({
      status: "denied",
      reason: "Already claimed",
    });
    const result = runAuthorizedSpecialistDecision(invocation);
    await expect(result).rejects.toThrow("Already claimed");
    await expect(result).rejects.toBeInstanceOf(InvocationClaimError);
    expect(runIndependentDecisions).not.toHaveBeenCalled();
  });
  it("propagates v2 failures without retry or a second Claim", async () => {
    const error = new Error("v2 failed");
    vi.mocked(runIndependentDecisions).mockRejectedValue(error);
    await expect(runAuthorizedSpecialistDecision(invocation)).rejects.toBe(
      error
    );
    expect(claimAuthorizedInvocation).toHaveBeenCalledTimes(1);
    expect(runIndependentDecisions).toHaveBeenCalledTimes(1);
  });
});
