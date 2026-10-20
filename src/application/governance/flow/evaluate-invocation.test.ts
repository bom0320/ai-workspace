import { describe, expect, it } from "vitest";

import {
  evaluateInvocationRequest,
  invocationEligibilitySchema,
  invokeSpecialistRequestSchema,
} from "../index.js";

const assignment = {
  assignmentId: "review", specialistId: "frontend", objective: "Review login",
  contextPaths: ["src/LoginForm.tsx", "src/useLogin.ts"],
};
const scope = {
  id: "scope-1", version: 2, proposalId: "proposal-1", approvalRecordId: "approval-1", policyVersion: "policy-1",
  goal: { objective: "Review login", targetRepository: "example" },
  snapshot: { repositoryRoot: "/repositories/example", commitSha: "abc123" },
  assignments: [assignment], budget: { maxAgentInvocations: 4 },
};
const request = {
  scopeId: "scope-1", scopeVersion: 2, assignmentId: "review", requestedContextPaths: ["src/LoginForm.tsx"],
};
const context = { scopeStatus: "active", usedAgentInvocations: 3 };

function freezeDeep(value: object): void {
  for (const child of Object.values(value)) {
    if (child && typeof child === "object") freezeDeep(child);
  }
  Object.freeze(value);
}

describe("evaluateInvocationRequest — eligibility only, never execution permission", () => {
  it("accepts an exact context subset with one remaining invocation, without issuing authority", () => {
    const result = evaluateInvocationRequest(request, scope, context);
    expect(result).toEqual({ status: "eligible" });
    expect(result).not.toHaveProperty("invocation");
    expect(invocationEligibilitySchema.parse(result)).toEqual(result);
  });

  it("accepts all approved paths in a different order", () => {
    expect(evaluateInvocationRequest({ ...request, requestedContextPaths: [...assignment.contextPaths].reverse() }, scope, context))
      .toEqual({ status: "eligible" });
  });

  it.each([
    { scopeId: "other" }, { scopeVersion: 1 }, { assignmentId: "unknown" },
    { objective: "Change approved work" }, { specialistId: "admin" },
    { authority: { repositoryAccess: "write", shellExecution: true } },
    { specialistAuthority: { repositoryAccess: "write", shellExecution: true } },
    { requestedContextPaths: [] },
  ])("denies scope mismatch, unknown assignment, or injected work: %j", (change) => {
    expect(evaluateInvocationRequest({ ...request, ...change }, scope, context).status).toBe("denied");
  });

  it.each(["revoked", "superseded", "unknown"])("denies lifecycle %s", (scopeStatus) => {
    expect(evaluateInvocationRequest(request, scope, { ...context, scopeStatus }).status).toBe("denied");
  });

  it("rejects duplicate assignment IDs even when a different ID is requested", () => {
    for (const assignments of [[assignment, assignment], [assignment,
      { ...assignment, assignmentId: "other" }, { ...assignment, assignmentId: "other" }]]) {
      expect(evaluateInvocationRequest(request, { ...scope, assignments }, context).status).toBe("denied");
    }
  });

  it.each([
    "src/admin/secret.ts", "src/LoginForm.tsx/secret", "/src/LoginForm.tsx", "C:/secret.ts",
    "C:secret.ts", "\\\\host\\share", "../secret.ts", "src/../LoginForm.tsx", "src/./LoginForm.tsx",
    "src//LoginForm.tsx", "src/LoginForm.tsx/", "src\\LoginForm.tsx", "src/secret\u0000.ts", "   ",
  ])("denies unauthorized or ambiguous path %j without normalization", (path) => {
    expect(evaluateInvocationRequest({ ...request, requestedContextPaths: [path] }, scope, context).status).toBe("denied");
  });

  it("denies a structurally valid CEO request outside approved context", () => {
    const input = invokeSpecialistRequestSchema.parse({ ...request, requestedContextPaths: ["src/admin/secret.ts"] });
    expect(evaluateInvocationRequest(input, scope, context)).toEqual({
      status: "denied", reason: expect.stringContaining("Staffing Proposal"),
    });
  });

  it("rejects duplicate requested paths and malformed approved paths even on exact match", () => {
    expect(evaluateInvocationRequest({ ...request, requestedContextPaths: ["src/LoginForm.tsx", "src/LoginForm.tsx"] }, scope, context).status).toBe("denied");
    for (const contextPaths of [["src/LoginForm.tsx", "src/LoginForm.tsx"], ["src/./LoginForm.tsx"], ["/absolute.ts"]]) {
      expect(evaluateInvocationRequest({ ...request, requestedContextPaths: contextPaths },
        { ...scope, assignments: [{ ...assignment, contextPaths }] }, context).status).toBe("denied");
    }
  });

  it.each([0, 1, 3])("accepts usage %s below the maximum", (usedAgentInvocations) => {
    expect(evaluateInvocationRequest(request, scope, { ...context, usedAgentInvocations }).status).toBe("eligible");
  });

  it.each([4, 5, -1, 0.5, NaN, Infinity, Number.MAX_SAFE_INTEGER + 1, "3", undefined])(
    "denies exhausted or invalid usage %j", (usedAgentInvocations) => {
      expect(evaluateInvocationRequest(request, scope, { ...context, usedAgentInvocations }).status).toBe("denied");
    },
  );

  it("denies malformed boundary inputs", () => {
    expect(evaluateInvocationRequest(null, scope, context).status).toBe("denied");
    expect(evaluateInvocationRequest(request, {}, context).status).toBe("denied");
    expect(evaluateInvocationRequest(request, scope, null).status).toBe("denied");
  });

  it("is deterministic with frozen inputs and does not reserve budget or require real files", () => {
    const inputs = structuredClone({ request, scope, context });
    const before = structuredClone(inputs);
    freezeDeep(inputs);
    // The snapshot and file names are fictional; no filesystem or Git dependency
    // is needed. Evaluation returns only data and cannot issue an invocation.
    for (let i = 0; i < 2; i++) {
      expect(evaluateInvocationRequest(inputs.request, inputs.scope, inputs.context)).toEqual({ status: "eligible" });
    }
    expect(inputs).toEqual(before);
  });
});
