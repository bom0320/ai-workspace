import { describe, expect, it } from "vitest";
import { specialistDefinitionsSchema } from "./definition.js";

const specialist = {
  id: "frontend",
  role: "Frontend",
  objective: "Analyze UI",
  authority: { repositoryAccess: "read" as const, shellExecution: false },
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
  it("keeps count and Phase A authority policy outside the shared list", () => {
    expect(specialistDefinitionsSchema.parse([])).toEqual([]);
    expect(
      specialistDefinitionsSchema.parse([
        {
          ...specialist,
          authority: { repositoryAccess: "write", shellExecution: true },
        },
      ])
    ).toHaveLength(1);
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
