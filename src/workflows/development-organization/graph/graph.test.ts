import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  getStaffingSystemPolicy,
  type StaffingSystemPolicy,
} from "@/application/governance/index.js";
import { createDevelopmentOrganizationGraph } from "../index.js";

vi.mock("@/application/governance/index.js", () => ({
  getStaffingSystemPolicy: vi.fn(),
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

describe("Development Organization policy lookup Graph", () => {
  it("compiles and invokes START → policy lookup → END without completing Phase A", async () => {
    vi.mocked(getStaffingSystemPolicy).mockReturnValue({
      status: "ready",
      configuration: systemPolicy,
      version: 2,
    });
    const result = await createDevelopmentOrganizationGraph().invoke({
      goal,
      repositoryPath: "/repository",
    });
    expect(getStaffingSystemPolicy).toHaveBeenCalledExactlyOnceWith(
      "/repository"
    );
    expect(result).toMatchObject({
      goal,
      repositoryPath: "/repository",
      systemPolicy,
      policyVersion: 2,
      status: "policy-ready",
    });
    expect(result.failure).toBeUndefined();
  });

  it("reports Governance denial and clears policy data supplied by a caller", async () => {
    vi.mocked(getStaffingSystemPolicy).mockReturnValue({
      status: "denied",
      reason: "System Policy unavailable",
    });
    const result = await createDevelopmentOrganizationGraph().invoke({
      goal,
      repositoryPath: "/repository",
      systemPolicy,
      policyVersion: 1,
      status: "policy-ready",
    });
    expect(result.status).toBe("policy-unavailable");
    expect(result.failure).toBe("System Policy unavailable");
    expect(result.systemPolicy).toBeUndefined();
    expect(result.policyVersion).toBeUndefined();
    expect(getStaffingSystemPolicy).toHaveBeenCalledTimes(1);
  });

  it("rejects a blank Repository path without consulting Governance", async () => {
    const result = await createDevelopmentOrganizationGraph().invoke({
      goal,
      repositoryPath: "   ",
    });
    expect(result.status).toBe("policy-unavailable");
    expect(result.failure).toBe("Repository path is required.");
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
    const graph = createDevelopmentOrganizationGraph();
    const first = await graph.invoke({
      goal,
      repositoryPath: "/repository",
      failure: "Old failure",
    });
    expect(first.failure).toBeUndefined();
    const second = await graph.invoke(first);
    expect(second.status).toBe("policy-unavailable");
    expect(second.systemPolicy).toBeUndefined();
    expect(second.policyVersion).toBeUndefined();
    expect(getStaffingSystemPolicy).toHaveBeenCalledTimes(2);
  });
});
