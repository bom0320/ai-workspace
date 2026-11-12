import { beforeEach, describe, expect, expectTypeOf, it, vi } from "vitest";
import {
  getStaffingSystemPolicy,
  type StaffingSystemPolicy,
  type StaffingSystemPolicyResult,
  approveStaffingProposal,
  authorizeSpecialistInvocation,
  claimAuthorizedInvocation,
} from "@/application/governance/index.js";
import { createPhaseAGraph, type PhaseAState } from "./index.js";
import { developmentOrganizationState } from "../state.js";

vi.mock("@/application/governance/index.js", () => ({
  getStaffingSystemPolicy: vi.fn(),
  approveStaffingProposal: vi.fn(),
  authorizeSpecialistInvocation: vi.fn(),
  claimAuthorizedInvocation: vi.fn(),
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

beforeEach(() => vi.resetAllMocks());

describe("Phase A policy lookup Graph", () => {
  it("keeps Organization inputs separate from Phase A results and reuses Governance result types", () => {
    expect(Object.keys(developmentOrganizationState.fields)).toEqual([
      "goal",
      "repositoryPath",
    ]);
    expectTypeOf<
      NonNullable<PhaseAState["policyLookup"]>
    >().toEqualTypeOf<StaffingSystemPolicyResult>();
  });

  it("compiles and invokes START → policy lookup → END without completing Phase A", async () => {
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
    expect(approveStaffingProposal).not.toHaveBeenCalled();
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
  });
});
