import { describe, expect, expectTypeOf, it } from "vitest";

import type {
  RepositoryAccess,
  RepositorySnapshot,
  SpecialistAuthority,
  SpecialistDefinition,
} from "@/application/decision/index.js";
import type { GoalSpec } from "@/contracts/goal.js";
import type { InspectedFile } from "@/contracts/inspected-file.js";

import {
  approvedOperatingScopeSchema,
  invokeSpecialistRequestSchema,
  authorizedSpecialistInvocationSchema,
  authorityVerdictSchema,
  type ApprovedOperatingScope,
  type AuthorizedSpecialistInvocation,
  type AuthorityVerdict,
} from "./authority.js";

const goal = { objective: "Review the interface", targetRepository: "example" };
const snapshot = { repositoryRoot: "/repositories/example", commitSha: "abc123" };
const assignment = {
  assignmentId: "assignment-1", specialistId: "frontend", objective: "Review accessibility",
  contextPaths: ["src/button.tsx"],
};
const scope = {
  id: "scope-1", version: 1, proposalId: "proposal-1", approvalRecordId: "approval-1", policyVersion: "policy-v1",
  goal, snapshot, assignments: [assignment], budget: { maxAgentInvocations: 2 },
};
const request = { scopeId: "scope-1", scopeVersion: 1, assignmentId: "assignment-1", requestedContextPaths: ["src/button.tsx"] };
const invocation = {
  invocationId: "invocation-1", goal, snapshot,
  specialist: { id: "frontend", role: "Frontend Specialist", objective: assignment.objective,
    authority: { repositoryAccess: "read" as const, shellExecution: false } },
  files: [{ path: "src/button.tsx", content: "// supplied content" }],
};

describe("approvedOperatingScopeSchema — structure only", () => {
  it("parses the approved scope record and preserves provenance fields", () => {
    expect(approvedOperatingScopeSchema.parse(scope)).toEqual(scope);
  });

  it.each(["id", "proposalId", "approvalRecordId", "policyVersion"])("rejects empty %s", (field) => {
    expect(approvedOperatingScopeSchema.safeParse({ ...scope, [field]: "" }).success).toBe(false);
  });

  it.each([0, -1, 1.5, "1"])("rejects invalid version or budget: %j", (value) => {
    expect(approvedOperatingScopeSchema.safeParse({ ...scope, version: value }).success).toBe(false);
    expect(approvedOperatingScopeSchema.safeParse({ ...scope, budget: { maxAgentInvocations: value } }).success).toBe(false);
  });

  it.each([
    [], [{}], [{ ...assignment, assignmentId: "" }], [{ ...assignment, specialistId: "" }],
    [{ ...assignment, objective: "" }], [{ ...assignment, contextPaths: [] }],
    [{ ...assignment, contextPaths: [""] }], [{ ...assignment, contextPaths: "src/button.tsx" }],
    [{ ...assignment, authority: { repositoryAccess: "write", shellExecution: true } }],
  ].map((assignments) => ({ assignments })))("rejects invalid assignments: %j", ({ assignments }) => {
    expect(approvedOperatingScopeSchema.safeParse({ ...scope, assignments }).success).toBe(false);
  });

  it.each([
    { ...scope, extra: true }, { ...scope, budget: { ...scope.budget, used: 0 } },
    { ...scope, goal: { ...goal, extra: true } }, { ...scope, snapshot: { ...snapshot, extra: true } },
    { ...scope, goal: { ...goal, objective: "" } }, { ...scope, snapshot: { ...snapshot, commitSha: "" } },
    { ...scope, snapshot: { ...snapshot, repositoryRoot: "" } },
  ])("rejects malformed or extra nested data: %j", (value) => {
    expect(approvedOperatingScopeSchema.safeParse(value).success).toBe(false);
  });

  it("does not check approval existence, scope lifecycle, specialist registration or budget availability", () => {
    expect(approvedOperatingScopeSchema.safeParse({ ...scope, approvalRecordId: "not-stored", policyVersion: "unknown",
      assignments: [{ ...assignment, specialistId: "not-registered" }] }).success).toBe(true);
  });
});

describe("invokeSpecialistRequestSchema", () => {
  it("accepts a CEO request without objective or authority fields", () => {
    expect(invokeSpecialistRequestSchema.parse(request)).toEqual(request);
  });

  it.each([
    { ...request, scopeId: "" }, { ...request, assignmentId: "" },
    { ...request, scopeVersion: 0 }, { ...request, scopeVersion: -1 }, { ...request, scopeVersion: 1.5 },
    { ...request, requestedContextPaths: [] }, { ...request, requestedContextPaths: [""] },
    { ...request, authority: invocation.specialist.authority }, { ...request, objective: "Expand scope" },
    { ...request, specialistId: "other" },
  ])("rejects malformed requests and authority injection: %j", (value) => {
    expect(invokeSpecialistRequestSchema.safeParse(value).success).toBe(false);
  });

  it("does not check scope identity or the approved Context subset", () => {
    expect(invokeSpecialistRequestSchema.safeParse({ ...request, scopeId: "unknown",
      requestedContextPaths: ["not-approved.ts"] }).success).toBe(true);
  });
});

describe("authorizedSpecialistInvocationSchema", () => {
  it("reuses the v2 input shapes without changing existing contracts", () => {
    const parsed = authorizedSpecialistInvocationSchema.parse(invocation);
    expect(parsed).toEqual(invocation);
    expectTypeOf<AuthorizedSpecialistInvocation["goal"]>().toEqualTypeOf<GoalSpec>();
    expectTypeOf<AuthorizedSpecialistInvocation["snapshot"]>().toEqualTypeOf<RepositorySnapshot>();
    expectTypeOf<AuthorizedSpecialistInvocation["specialist"]>().toEqualTypeOf<SpecialistDefinition>();
    expectTypeOf<AuthorizedSpecialistInvocation["files"]>().toEqualTypeOf<InspectedFile[]>();
    expectTypeOf<SpecialistAuthority>().toEqualTypeOf<{ repositoryAccess: "none" | "read" | "write"; shellExecution: boolean }>();
    expectTypeOf<RepositoryAccess>().toEqualTypeOf<"none" | "read" | "write">();
    expectTypeOf<ApprovedOperatingScope["goal"]>().toEqualTypeOf<GoalSpec>();
    // The existing v2 flow consumes goal, snapshot, and { specialist, files }.
    const input: { specialist: SpecialistDefinition; files: InspectedFile[] } = parsed;
    expect(input.specialist).toBe(parsed.specialist);
  });

  it.each([
    { ...invocation, invocationId: "" }, { ...invocation, files: [] },
    { ...invocation, files: [{ path: "", content: "" }] },
    { ...invocation, files: [{ path: "a.ts", content: "", extra: true }] },
    { ...invocation, extra: true }, { ...invocation, specialist: { ...invocation.specialist, id: "" } },
    { ...invocation, specialist: { ...invocation.specialist, role: "" } },
    { ...invocation, specialist: { ...invocation.specialist, objective: "" } },
    { ...invocation, specialist: { ...invocation.specialist, extra: true } },
    { ...invocation, specialist: { ...invocation.specialist, authority: { repositoryAccess: "admin", shellExecution: false } } },
    { ...invocation, specialist: { ...invocation.specialist, authority: { repositoryAccess: "read", shellExecution: "false" } } },
    { ...invocation, specialist: { ...invocation.specialist, authority: { ...invocation.specialist.authority, network: true } } },
  ])("rejects malformed or extra invocation data: %j", (value) => {
    expect(authorizedSpecialistInvocationSchema.safeParse(value).success).toBe(false);
  });

  it("does not grant authority, restrict v2 runtime support or verify file provenance by parsing", () => {
    expect(authorizedSpecialistInvocationSchema.safeParse({ ...invocation,
      specialist: { ...invocation.specialist, authority: { repositoryAccess: "write", shellExecution: true } },
      files: [{ path: "not-loaded.ts", content: "unverified" }],
    }).success).toBe(true);
  });
});

describe("authorityVerdictSchema", () => {
  it("parses all branches with type-level discriminant narrowing", () => {
    const values = [{ status: "allowed", invocation }, { status: "approval-required", reason: "Additional approval needed" },
      { status: "denied", reason: "Policy disallows this request" }];
    for (const value of values) {
      const verdict: AuthorityVerdict = authorityVerdictSchema.parse(value);
      if (verdict.status === "allowed") {
        expectTypeOf(verdict.invocation).toEqualTypeOf<AuthorizedSpecialistInvocation>();
      } else if (verdict.status === "approval-required") {
        expectTypeOf(verdict.status).toEqualTypeOf<"approval-required">();
        expectTypeOf(verdict.reason).toEqualTypeOf<string>();
      } else {
        expectTypeOf(verdict.status).toEqualTypeOf<"denied">();
        expectTypeOf(verdict.reason).toEqualTypeOf<string>();
      }
      expect(verdict).toEqual(value);
    }
  });

  it.each([
    { status: "allowed" }, { status: "allowed", invocation, reason: "extra" },
    { status: "denied", reason: "" }, { status: "approval-required", reason: "" },
    { status: "denied", reason: "Policy", invocation }, { status: "unknown", reason: "Unknown" },
  ])("rejects missing payloads, empty reasons and mixed branches: %j", (value) => {
    expect(authorityVerdictSchema.safeParse(value).success).toBe(false);
  });
});
