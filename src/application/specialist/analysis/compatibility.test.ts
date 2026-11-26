import { describe, expect, expectTypeOf, it } from "vitest";

import {
  repositorySnapshotSchema,
  type RepositorySnapshot,
} from "@/contracts/repository/snapshot.js";
import {
  specialistDefinitionSchema,
  type SpecialistDefinition,
} from "@/contracts/specialist/definition.js";
import {
  specialistAuthoritySchema,
  type SpecialistAuthority,
  type RepositoryAccess,
} from "@/contracts/specialist/authority.js";
describe("Specialist shared contracts", () => {
  it("preserves the contract types", () => {
    expectTypeOf<RepositorySnapshot>().toEqualTypeOf<{
      repositoryRoot: string;
      commitSha: string;
    }>();
    expectTypeOf<SpecialistDefinition>().toEqualTypeOf<{
      id: string;
      role: string;
      objective: string;
    }>();
    expectTypeOf<
      SpecialistAuthority["repositoryAccess"]
    >().toEqualTypeOf<RepositoryAccess>();
  });
  it("keeps structural parsing distinct from runtime authority and Snapshot validation", () => {
    const snapshot = {
      repositoryRoot: "/not-queried",
      commitSha: "not-a-verified-commit",
    };
    expect(repositorySnapshotSchema.parse(snapshot)).toEqual(snapshot);
    expect(
      repositorySnapshotSchema.safeParse({ ...snapshot, approval: true })
        .success
    ).toBe(false);
    expect(
      repositorySnapshotSchema.safeParse({ ...snapshot, commitSha: "" }).success
    ).toBe(false);
    for (const repositoryAccess of ["none", "read", "write"] as const) {
      const authority = { repositoryAccess, shellExecution: true };
      const specialist = {
        id: "unregistered",
        role: "Role",
        objective: "Objective",
      };
      expect(specialistDefinitionSchema.parse(specialist)).toEqual(specialist);
      expect(specialistAuthoritySchema.parse(authority)).toEqual(authority);
      expect(
        specialistDefinitionSchema.safeParse({ ...specialist, authority })
          .success
      ).toBe(false);
      expect(
        specialistAuthoritySchema.safeParse({ ...authority, extra: true })
          .success
      ).toBe(false);
      expect(
        specialistDefinitionSchema.safeParse({ ...specialist, extra: true })
          .success
      ).toBe(false);
      expect(
        specialistDefinitionSchema.safeParse({ ...specialist, id: "" }).success
      ).toBe(false);
    }
  });
});
