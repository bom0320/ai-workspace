import { describe, expect, expectTypeOf, it } from "vitest";

import {
  ceoStaffingDecisionSchema,
  staffingAssignmentDraftSchema,
  staffingDraftSchema,
  type CEOStaffingDecision,
  type StaffingAssignmentDraft,
  type StaffingDraft,
} from "../index.js";

const assignment = {
  specialistId: "frontend", objective: "Review login feedback",
  contextPaths: ["src/login.ts"], rationale: "Frontend expertise",
};
const draft = {
  intent: { problem: "Login failures", desiredOutcome: "Understand failures", considerations: [], uncertainties: [] },
  assignments: [assignment], budget: { maxAgentInvocations: 2 }, rationale: "One focused reviewer",
};

describe("StaffingDraft — CEO proposal without authority", () => {
  it("parses a draft with goal-specific assignments", () => {
    expect(staffingDraftSchema.parse(draft)).toEqual(draft);
    expect(staffingAssignmentDraftSchema.parse(assignment)).toEqual(assignment);
  });

  it.each([0, -1, 1.5, "2", NaN, Infinity])("rejects invalid budget %j", (maxAgentInvocations) => {
    expect(staffingDraftSchema.safeParse({ ...draft, budget: { maxAgentInvocations } }).success).toBe(false);
  });

  it.each([
    { specialistId: "" }, { objective: "" }, { contextPaths: [] }, { contextPaths: [""] }, { rationale: "" },
    { specialistId: undefined }, { objective: undefined }, { contextPaths: undefined }, { rationale: undefined },
    { assignmentId: "ceo-issued" }, { authority: { repositoryAccess: "write", shellExecution: true } },
    { repositoryAccess: "write" }, { shellExecution: true }, { approvalRecordId: "approval-1" },
  ])("rejects invalid or privileged assignment fields: %j", (change) => {
    expect(staffingDraftSchema.safeParse({ ...draft, assignments: [{ ...assignment, ...change }] }).success).toBe(false);
  });

  it.each([
    { assignments: [] }, { rationale: "" }, { intent: { ...draft.intent, extra: true } },
    { id: "ceo-issued" }, { proposalId: "ceo-issued" }, { approvalRecordId: "approval-1" },
    { policyVersion: "policy-1" }, { goal: { objective: "Rewritten goal" } }, { snapshot: {} },
    { authority: { repositoryAccess: "write" } }, { repositoryAccess: "write" }, { shellExecution: true },
    { approvedOperatingScope: {} }, { budget: { maxAgentInvocations: 2, approved: true } },
  ])("rejects malformed draft and CEO-owned approval or authority data: %j", (change) => {
    expect(staffingDraftSchema.safeParse({ ...draft, ...change }).success).toBe(false);
  });
});

describe("CEOStaffingDecision", () => {
  it("parses and narrows each branch", () => {
    const values = [
      { type: "propose", draft },
      { type: "inspect", paths: ["src/login.ts"], reason: "Need implementation context" },
      { type: "escalate", reason: "Goal is ambiguous", questions: ["Which login flow?"] },
    ];
    for (const value of values) {
      const parsed: CEOStaffingDecision = ceoStaffingDecisionSchema.parse(value);
      expect(parsed).toEqual(value);
      if (parsed.type === "propose") {
        expectTypeOf(parsed.draft).toEqualTypeOf<StaffingDraft>();
        expectTypeOf(parsed.draft.assignments).toEqualTypeOf<StaffingAssignmentDraft[]>();
      } else if (parsed.type === "inspect") {
        expectTypeOf(parsed.paths).toEqualTypeOf<string[]>();
        expectTypeOf(parsed.reason).toEqualTypeOf<string>();
      } else {
        expectTypeOf(parsed.type).toEqualTypeOf<"escalate">();
        expectTypeOf(parsed.questions).toEqualTypeOf<string[]>();
      }
    }
  });

  it.each([
    { type: "unknown" }, { type: "propose" }, { type: "inspect" }, { type: "escalate" },
    { type: "inspect", paths: [] , reason: "Need context" },
    { type: "inspect", paths: [""], reason: "Need context" },
    { type: "inspect", paths: ["src/login.ts"] },
    { type: "inspect", paths: ["src/login.ts"], reason: "" },
    { type: "escalate", reason: "Need clarification", questions: [] },
    { type: "escalate", reason: "Need clarification", questions: [""] },
    { type: "escalate", questions: ["Which flow?"] },
    { type: "escalate", reason: "", questions: ["Which flow?"] },
    { type: "propose", draft, paths: ["src/login.ts"] },
    { type: "inspect", paths: ["src/login.ts"], reason: "Need context", draft },
    { type: "inspect", paths: ["src/login.ts"], reason: "Need context", questions: ["Which flow?"] },
    { type: "escalate", reason: "Need clarification", questions: ["Which flow?"], draft },
    { type: "escalate", reason: "Need clarification", questions: ["Which flow?"], paths: ["src/login.ts"] },
  ])("rejects invalid, incomplete, or mixed branches: %j", (value) => {
    expect(ceoStaffingDecisionSchema.safeParse(value).success).toBe(false);
  });

  it("does not turn a structurally valid inspection request into file access permission", () => {
    const value = { type: "inspect", paths: ["../unverified.ts"], reason: "CEO requests more context" };
    expect(ceoStaffingDecisionSchema.parse(value)).toEqual(value);
  });
});
