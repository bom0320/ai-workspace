import { beforeEach, expect, it, vi } from "vitest";
import {
  AssignmentRegistrationError,
  getAssignmentPlanContext,
  registerAssignmentPlan,
} from "@/application/governance/index.js";
import { prepareAssignmentPlan } from "./prepare-assignment-plan.js";

vi.mock("@/application/governance/index.js", () => ({
  AssignmentRegistrationError: class extends Error {
    constructor(public readonly failure: "provenance" | "proposal" | "ledger") {
      super("Private Ledger path");
    }
  },
  getAssignmentPlanContext: vi.fn(),
  registerAssignmentPlan: vi.fn(),
}));

const handoff = {} as Parameters<typeof prepareAssignmentPlan>[0];
const workItem = {
  id: "work",
  workType: "read-only" as const,
  objective: "Analyze",
  deliverable: "Findings",
  dependsOn: [],
};
const proposal = {
  status: "proposed" as const,
  approvedDecisionId: "decision",
  workItems: [workItem],
};
const assignment = {
  id: "review",
  workItemId: "work",
  specialistId: "reviewer",
  repositoryAccessCeiling: "read",
  objective: "Analyze",
  deliverable: "Findings",
  dependsOn: [],
};

beforeEach(() => {
  vi.resetAllMocks();
  vi.mocked(getAssignmentPlanContext).mockReturnValue({
    workItems: [workItem],
    specialists: [{ id: "reviewer", role: "Review", objective: "Analyze" }],
    repositoryAccessCeilings: ["read"],
  });
});

it("classifies agent failures without exposing internal detail", async () => {
  const agent = vi.fn().mockRejectedValue(new Error("/private/repository"));
  const result = await prepareAssignmentPlan(
    handoff,
    proposal,
    ["work"],
    agent
  );
  expect(result).toMatchObject({ status: "denied", failure: "agent" });
  expect(JSON.stringify(result)).not.toContain("/private/repository");
  expect(registerAssignmentPlan).not.toHaveBeenCalled();
});

it("rejects invalid proposals before registration", async () => {
  const result = await prepareAssignmentPlan(
    handoff,
    proposal,
    ["work"],
    async () => [{ ...assignment, dependsOn: ["unknown"] }]
  );
  expect(result).toMatchObject({ status: "denied", failure: "proposal" });
  expect(registerAssignmentPlan).not.toHaveBeenCalled();
});

it("does not call the agent when the current approval cannot be resolved", async () => {
  vi.mocked(getAssignmentPlanContext).mockImplementation(() => {
    throw new Error("Snapshot drift");
  });
  const agent = vi.fn();
  await expect(
    prepareAssignmentPlan(handoff, proposal, ["work"], agent)
  ).resolves.toMatchObject({ status: "denied", failure: "provenance" });
  expect(agent).not.toHaveBeenCalled();
});

it.each(["provenance", "proposal", "ledger"] as const)(
  "retains sanitized %s failures from registration",
  async (failure) => {
    vi.mocked(registerAssignmentPlan).mockImplementation(() => {
      throw new AssignmentRegistrationError(failure);
    });
    const result = await prepareAssignmentPlan(
      handoff,
      proposal,
      ["work"],
      async () => [assignment]
    );
    expect(result).toMatchObject({ status: "denied", failure });
    expect(JSON.stringify(result)).not.toContain("Private Ledger path");
  }
);

it("rejects an unknown Specialist before writing the Plan", async () => {
  await expect(
    prepareAssignmentPlan(handoff, proposal, ["work"], async () => [
      { ...assignment, specialistId: "invented" },
    ])
  ).resolves.toMatchObject({ status: "denied", failure: "proposal" });
  expect(registerAssignmentPlan).not.toHaveBeenCalled();
});
