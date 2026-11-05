import { describe, expect, it } from "vitest";
import { isContextPathAllowed } from "@/services/repository-inspection/index.js";
import {
  humanDelegationPolicyInputSchema,
  humanDelegationPolicySchema,
  recordedHumanDelegationPolicySchema,
} from "./policy.js";
import { readRecordedDelegationInput } from "../flow/validation/delegation-configuration.js";

const input = {
  allowedSpecialistIds: ["frontend"],
  delegatedContextScopes: [{ kind: "file" as const, path: "a.ts" }],
  maxAgentInvocations: 2,
  expiresAt: "2027-01-01T00:00:00.000Z",
};
const metadata = {
  id: "delegation-1",
  version: 1,
  repositoryRoot: "/repo",
  systemPolicyVersion: 1,
  status: "active" as const,
  approval: {
    id: "confirmation-1",
    uid: 1,
    confirmedAt: "2026-11-01T00:00:00.000Z",
  },
};
describe("Human Delegation input and authenticated record contracts", () => {
  it("accepts only automatic approval settings, including an empty Context range", () => {
    expect(humanDelegationPolicyInputSchema.parse(input)).toEqual(input);
    expect(
      humanDelegationPolicyInputSchema.parse({
        ...input,
        delegatedContextScopes: [],
      }).delegatedContextScopes
    ).toEqual([]);
    expect(
      humanDelegationPolicySchema.parse({ ...input, ...metadata })
    ).toEqual({ ...input, ...metadata });
  });
  it.each([
    ["phase", "phase-a"],
    ["repositoryAccess", "read"],
    ["shellExecution", false],
    ["allowedContextPaths", ["a.ts"]],
    ["contextAccessPolicy", { allowedScopes: [] }],
  ])(
    "rejects removed input field %s even if its value is safe",
    (field, value) => {
      expect(
        humanDelegationPolicyInputSchema.safeParse({ ...input, [field]: value })
          .success
      ).toBe(false);
    }
  );
  it("reads legacy file scopes without directory expansion or record transformation", () => {
    const legacy = {
      ...metadata,
      phase: "phase-a",
      repositoryAccess: "read",
      shellExecution: false,
      allowedSpecialistIds: ["frontend"],
      allowedContextPaths: ["src"],
      maxAgentInvocations: 2,
      expiresAt: input.expiresAt,
    };
    const record = recordedHumanDelegationPolicySchema.parse(legacy);
    expect(record).toEqual(legacy);
    expect(humanDelegationPolicyInputSchema.safeParse(legacy).success).toBe(
      false
    );
    expect(humanDelegationPolicySchema.safeParse(legacy).success).toBe(false);
    const projection = readRecordedDelegationInput(record);
    expect(projection.delegatedContextScopes).toEqual([
      { kind: "file", path: "src" },
    ]);
    expect(
      isContextPathAllowed("src/a.ts", {
        allowedScopes: projection.delegatedContextScopes,
      })
    ).toBe(false);
    expect(record).toEqual(legacy);
  });
});
