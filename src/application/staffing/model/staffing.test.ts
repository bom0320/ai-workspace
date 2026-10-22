import { describe, expect, expectTypeOf, it } from "vitest";

import type {
  RepositorySnapshot,
  SpecialistDefinition,
} from "@/application/decision/index.js";
import { approvedOperatingScopeSchema } from "@/application/governance/index.js";
import type { GoalSpec } from "@/contracts/goal.js";

import {
  intentAnalysisSchema,
  staffingAssignmentSchema,
  staffingProposalSchema,
  type StaffingProposal,
} from "../index.js";

const intent = {
  problem: "Login failures",
  desiredOutcome: "Understand failure causes",
  considerations: ["Accessibility"],
  uncertainties: ["Failure frequency"],
};
const assignment = {
  assignmentId: "assignment-1",
  specialistId: "frontend",
  objective: "Review login feedback",
  contextPaths: ["src/login.ts"],
  rationale: "Frontend expertise",
};
const proposal = {
  id: "proposal-1",
  goal: {
    objective: "Investigate login",
    targetRepository: "example",
    constraints: ["Do not modify files"],
  },
  snapshot: { repositoryRoot: "/repositories/example", commitSha: "abc123" },
  intent,
  assignments: [assignment],
  budget: { maxAgentInvocations: 2 },
  rationale: "One focused reviewer",
};

describe("IntentAnalysis — CEO interpretation", () => {
  it("parses interpretation and allows no considerations or uncertainties", () => {
    expect(intentAnalysisSchema.parse(intent)).toEqual(intent);
    expect(
      intentAnalysisSchema.parse({
        ...intent,
        considerations: [],
        uncertainties: [],
      })
    ).toEqual({ ...intent, considerations: [], uncertainties: [] });
  });

  it.each([
    { problem: "" },
    { desiredOutcome: "" },
    { considerations: [""] },
    { uncertainties: [""] },
    { considerations: undefined },
    { uncertainties: undefined },
    { extra: true },
    { goal: proposal.goal },
  ])("rejects missing, empty, or unknown fields: %j", (change) => {
    expect(
      intentAnalysisSchema.safeParse({ ...intent, ...change }).success
    ).toBe(false);
  });
});

describe("StaffingProposal — unapproved structure only", () => {
  it("preserves original Human Goal separately from CEO interpretation without approval data", () => {
    const original = structuredClone(proposal);
    const parsed = staffingProposalSchema.parse(proposal);
    expect(parsed).toEqual(original);
    expect(parsed.goal.constraints).toEqual(["Do not modify files"]);
    expect(parsed.goal.objective).not.toBe(parsed.intent.desiredOutcome);
    expect(parsed).not.toHaveProperty("approvalRecordId");
    expect(parsed).not.toHaveProperty("policyVersion");
    expect(approvedOperatingScopeSchema.safeParse(parsed).success).toBe(false);
    expect(proposal).toEqual(original);
    expectTypeOf<StaffingProposal["goal"]>().toEqualTypeOf<GoalSpec>();
    expectTypeOf<
      StaffingProposal["snapshot"]
    >().toEqualTypeOf<RepositorySnapshot>();
    expectTypeOf<
      StaffingProposal["assignments"][number]["specialistId"]
    >().toEqualTypeOf<SpecialistDefinition["id"]>();
  });

  it.each([
    { id: "" },
    { id: undefined },
    { assignments: [] },
    { assignments: [{ ...assignment, assignmentId: "" }] },
    { assignments: [{ ...assignment, assignmentId: undefined }] },
    { assignments: [{ ...assignment, objective: "" }] },
    { assignments: [{ ...assignment, contextPaths: [] }] },
    { assignments: [{ ...assignment, rationale: "" }] },
    { rationale: "" },
    { budget: { maxAgentInvocations: 0 } },
    { budget: { maxAgentInvocations: 1, approved: true } },
    { goal: { ...proposal.goal, constraints: [""] } },
    { goal: { ...proposal.goal, extra: true } },
    { snapshot: { ...proposal.snapshot, commitSha: "" } },
    { snapshot: { ...proposal.snapshot, extra: true } },
    { approvalRecordId: "approval-1" },
    { authority: { repositoryAccess: "write" } },
  ])("rejects invalid structure or additional authority: %j", (change) => {
    expect(
      staffingProposalSchema.safeParse({ ...proposal, ...change }).success
    ).toBe(false);
  });

  it("does not verify issuance, registration, policy, context access, or repository state", () => {
    expect(
      staffingProposalSchema.safeParse({
        ...proposal,
        id: "not-issued",
        intent: {
          ...intent,
          desiredOutcome: "A conflicting CEO interpretation",
        },
        assignments: [
          {
            ...assignment,
            specialistId: "unregistered",
            contextPaths: ["../unverified.ts"],
          },
        ],
        budget: { maxAgentInvocations: 999999 },
      }).success
    ).toBe(true);
  });

  it("rejects authority injected into a proposal assignment", () => {
    expect(
      staffingAssignmentSchema.safeParse({
        ...assignment,
        authority: { repositoryAccess: "write", shellExecution: true },
      }).success
    ).toBe(false);
  });
});
