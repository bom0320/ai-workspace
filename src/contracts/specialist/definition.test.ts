import { staffingSystemPolicySchema } from "../staffing/system-policy.js";
import { describe, expect, it } from "vitest";
import { specialistDefinitionsSchema } from "./definition.js";

const specialist = {
  id: "frontend",
  role: "Frontend",
  objective: "Analyze UI",
};

describe("Specialist registration list invariant", () => {
  it("accepts distinct IDs and rejects duplicate IDs even when roles differ", () => {
    expect(
      specialistDefinitionsSchema.parse([
        specialist,
        { ...specialist, id: "ux" },
      ])
    ).toHaveLength(2);
    expect(() =>
      specialistDefinitionsSchema.parse([
        specialist,
        { ...specialist, role: "Other role" },
      ])
    ).toThrow("Duplicate Specialist IDs");
  });
  it("permits an empty catalog and rejects authority in a definition", () => {
    expect(specialistDefinitionsSchema.parse([])).toEqual([]);
    expect(
      specialistDefinitionsSchema.safeParse([
        {
          ...specialist,
          authority: { repositoryAccess: "write", shellExecution: true },
        },
      ]).success
    ).toBe(false);
  });
  it("still validates each definition and rejects unknown fields", () => {
    expect(
      specialistDefinitionsSchema.safeParse([{ ...specialist, id: "" }]).success
    ).toBe(false);
    expect(
      specialistDefinitionsSchema.safeParse([{ ...specialist, approved: true }])
        .success
    ).toBe(false);
  });
});

it("preserves flat Phase A registrations and rejects missing, write, Shell, and duplicate entries", () => {
  const list = staffingSystemPolicySchema.shape.availableSpecialists;
  const registration = {
    ...specialist,
    authority: { repositoryAccess: "read", shellExecution: false },
  };
  expect(list.parse([registration])).toEqual([registration]);
  expect(list.safeParse([specialist]).success).toBe(false);
  expect(
    list.safeParse([
      {
        ...registration,
        authority: { ...registration.authority, repositoryAccess: "write" },
      },
    ]).success
  ).toBe(false);
  expect(
    list.safeParse([
      {
        ...registration,
        authority: { ...registration.authority, shellExecution: true },
      },
    ]).success
  ).toBe(false);
  expect(
    list.safeParse([registration, { ...registration, role: "Duplicate" }])
      .success
  ).toBe(false);
});
