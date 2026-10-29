import { describe, expect, expectTypeOf, it } from "vitest";

import {
  repositorySnapshotSchema,
  type RepositorySnapshot,
} from "@/contracts/repository-snapshot.js";
import {
  specialistDefinitionSchema,
  type SpecialistDefinition,
} from "@/contracts/specialist.js";
import {
  specialistAuthoritySchema,
  type SpecialistAuthority,
  type RepositoryAccess,
} from "@/contracts/specialist-authority.js";
import * as snapshotService from "@/services/repository-snapshot/index.js";

import * as publicAPI from "./index.js";
import * as legacySnapshot from "./model/snapshot.js";
import * as legacySpecialist from "./model/specialist.js";
import * as legacyAuthority from "./model/authority.js";
import * as legacySnapshotFlow from "./flow/context/repository-snapshot.js";

// Existing consumers can retain both public and historical direct imports.
describe("Decision shared contract compatibility", () => {
  it("re-exports the same schema instances from both legacy paths", () => {
    expect(publicAPI.repositorySnapshotSchema).toBe(repositorySnapshotSchema);
    expect(legacySnapshot.repositorySnapshotSchema).toBe(
      repositorySnapshotSchema
    );
    expect(publicAPI.specialistDefinitionSchema).toBe(
      specialistDefinitionSchema
    );
    expect(legacySpecialist.specialistDefinitionSchema).toBe(
      specialistDefinitionSchema
    );
    expect(publicAPI.specialistAuthoritySchema).toBe(specialistAuthoritySchema);
    expect(legacyAuthority.specialistAuthoritySchema).toBe(
      specialistAuthoritySchema
    );
  });

  it("re-exports the same capture/assert functions without wrappers", () => {
    expect(publicAPI.captureRepositorySnapshot).toBe(
      snapshotService.captureRepositorySnapshot
    );
    expect(publicAPI.assertRepositoryMatchesSnapshot).toBe(
      snapshotService.assertRepositoryMatchesSnapshot
    );
    expect(legacySnapshotFlow.captureRepositorySnapshot).toBe(
      snapshotService.captureRepositorySnapshot
    );
    expect(legacySnapshotFlow.assertRepositoryMatchesSnapshot).toBe(
      snapshotService.assertRepositoryMatchesSnapshot
    );
  });

  it("retains inferred public types and their existing fields", () => {
    expectTypeOf<publicAPI.RepositorySnapshot>().toEqualTypeOf<RepositorySnapshot>();
    expectTypeOf<legacySnapshot.RepositorySnapshot>().toEqualTypeOf<RepositorySnapshot>();
    expectTypeOf<RepositorySnapshot>().toEqualTypeOf<{
      repositoryRoot: string;
      commitSha: string;
    }>();
    expectTypeOf<publicAPI.SpecialistDefinition>().toEqualTypeOf<SpecialistDefinition>();
    expectTypeOf<legacySpecialist.SpecialistDefinition>().toEqualTypeOf<SpecialistDefinition>();
    expectTypeOf<SpecialistDefinition>().toEqualTypeOf<{
      id: string;
      role: string;
      objective: string;
      authority: SpecialistAuthority;
    }>();
    expectTypeOf<publicAPI.SpecialistAuthority>().toEqualTypeOf<SpecialistAuthority>();
    expectTypeOf<legacyAuthority.SpecialistAuthority>().toEqualTypeOf<SpecialistAuthority>();
    expectTypeOf<publicAPI.RepositoryAccess>().toEqualTypeOf<RepositoryAccess>();
    expectTypeOf<legacyAuthority.RepositoryAccess>().toEqualTypeOf<RepositoryAccess>();
    expectTypeOf<SpecialistAuthority>().toEqualTypeOf<{
      repositoryAccess: "none" | "read" | "write";
      shellExecution: boolean;
    }>();
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
        authority,
      };
      expect(specialistDefinitionSchema.parse(specialist)).toEqual(specialist);
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
