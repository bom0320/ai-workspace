import { describe, expect, it } from "vitest";
import { contextAccessPolicySchema } from "@/contracts/repository/context-access-policy.js";
import {
  isContextPathAllowed,
  isContextScopeContained,
  validateContextAccessPolicy,
} from "./access-policy.js";

const policy = validateContextAccessPolicy({
  allowedScopes: [
    { kind: "directory", path: "src/ui" },
    { kind: "file", path: "README.md" },
  ],
});
describe("Context access scopes", () => {
  it.each(["src/ui/Form.ts", "src/ui/nested/a.ts", "README.md"])(
    "allows %s",
    (path) => {
      expect(isContextPathAllowed(path, policy)).toBe(true);
    }
  );
  it.each([
    "src/ui-extra/a.ts",
    "src/uix/a.ts",
    "src/ui",
    "README.md/a",
    "other.ts",
    "src/ui/../secret",
    "src/ui//a",
    "src/ui/./a",
    "/src/ui/a",
    "C:/src/ui/a",
    "src\\ui\\a",
  ])("denies %s", (path) => {
    expect(isContextPathAllowed(path, policy)).toBe(false);
  });
  it.each([
    "..",
    ".",
    "src/../ui",
    "src//ui",
    "src/",
    "/src",
    "C:/src",
    "src\\ui",
  ])("rejects unsafe scope %s", (path) => {
    expect(() =>
      validateContextAccessPolicy({
        allowedScopes: [{ kind: "directory", path }],
      })
    ).toThrow();
  });
  it("requires an explicit policy and treats empty scopes as deny", () => {
    expect(() => validateContextAccessPolicy(undefined)).toThrow();
    expect(
      isContextPathAllowed(
        "src/a",
        validateContextAccessPolicy({ allowedScopes: [] })
      )
    ).toBe(false);
  });
  it("rejects mixed nonempty policies and unknown schema fields", () => {
    expect(() =>
      validateContextAccessPolicy({
        contextAccessPolicy: policy,
        allowedContextPaths: ["extra"],
      })
    ).toThrow();
    expect(
      contextAccessPolicySchema.safeParse({ allowedScopes: [], deny: [] })
        .success
    ).toBe(false);
    expect(
      contextAccessPolicySchema.safeParse({
        allowedScopes: [{ kind: "glob", path: "src/*" }],
      }).success
    ).toBe(false);
  });
  it("proves directory containment only using a containing directory", () => {
    expect(
      isContextScopeContained({ kind: "directory", path: "src/ui" }, policy)
    ).toBe(true);
    expect(
      isContextScopeContained(
        { kind: "directory", path: "src/ui/nested" },
        policy
      )
    ).toBe(true);
    expect(
      isContextScopeContained({ kind: "directory", path: "src" }, policy)
    ).toBe(false);
    expect(
      isContextScopeContained({ kind: "directory", path: "src/uix" }, policy)
    ).toBe(false);
    expect(
      isContextScopeContained({ kind: "directory", path: "README.md" }, policy)
    ).toBe(false);
    expect(
      isContextScopeContained({ kind: "file", path: "README.md" }, policy)
    ).toBe(true);
  });
});
