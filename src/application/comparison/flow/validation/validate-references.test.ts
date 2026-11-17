import { describe, expect, it } from "vitest";

import {
  comparisonPayloadSchema,
  type ComparisonPayload,
} from "../../protocol/comparison.js";
import type { ComparisonContext } from "../../protocol/context.js";
import { validateComparisonReferences } from "./validate-references.js";

const context: ComparisonContext = {
  goal: { objective: "Review interaction", targetRepository: "example" },
  repositoryCommitSha: "abc123",
  decisions: [
    {
      specialistId: "frontend",
      recommendation: "Show loading feedback",
      evidence: [
        { path: "button.tsx", description: "Loading state" },
        { path: "button.tsx", description: "Disabled state" },
      ],
      risks: [],
      uncertainty: [],
    },
    {
      specialistId: "ux",
      recommendation: "Make pending state visible",
      evidence: [
        { path: "interaction.md", description: "Pending interaction" },
      ],
      risks: [],
      uncertainty: [],
    },
  ],
};
const frontend = {
  specialistId: "frontend",
  statement: "Provide loading feedback",
  evidenceIndexes: [0, 1],
};
const ux = {
  specialistId: "ux",
  statement: "Provide pending feedback",
  evidenceIndexes: [0],
};
const finding = {
  concern: "Pending state",
  relation: "agreement" as const,
  positions: [frontend, ux],
  rationale: "Positions support visible feedback",
};
const gap = {
  concern: "Touch behavior",
  kind: "uncertainty" as const,
  specialistIds: ["frontend", "ux"],
  reason: "No touch observation",
};
const payload: ComparisonPayload = { findings: [finding], gaps: [gap] };

describe("validateComparisonReferences", () => {
  it("accepts valid source references without transforming the input", () => {
    const before = structuredClone({ context, payload });
    expect(validateComparisonReferences(context, payload)).toBeUndefined();
    expect({ context, payload }).toEqual(before);
  });

  it("does not impose ordering on Evidence indexes", () => {
    expect(() =>
      validateComparisonReferences(context, {
        ...payload,
        findings: [
          {
            ...finding,
            positions: [{ ...frontend, evidenceIndexes: [1, 0] }, ux],
          },
        ],
      })
    ).not.toThrow();
  });

  it("accepts empty findings and gaps without requiring source Decisions", () => {
    expect(() =>
      validateComparisonReferences(
        { ...context, decisions: [] },
        { findings: [], gaps: [] }
      )
    ).not.toThrow();
  });

  it("allows the same references in different Findings and Gaps", () => {
    expect(() =>
      validateComparisonReferences(context, {
        findings: [finding, finding],
        gaps: [gap, gap],
      })
    ).not.toThrow();
  });

  it("rejects a Position Specialist missing from the source Decisions", () => {
    const output = comparisonPayloadSchema.parse({
      ...payload,
      findings: [
        {
          ...finding,
          positions: [{ ...frontend, specialistId: "backend" }, ux],
        },
      ],
    });
    expect(() => validateComparisonReferences(context, output)).toThrow(
      "Unknown comparison specialist: backend."
    );
  });

  it.each([2, 999])("rejects an out-of-range Evidence index: %s", (index) => {
    const output = comparisonPayloadSchema.parse({
      ...payload,
      findings: [
        {
          ...finding,
          positions: [{ ...frontend, evidenceIndexes: [index] }, ux],
        },
      ],
    });
    expect(() => validateComparisonReferences(context, output)).toThrow(
      `Comparison evidence index is out of range for specialist frontend: ${index}.`
    );
  });

  it("checks indexes against each Specialist's own Evidence array", () => {
    expect(() =>
      validateComparisonReferences(context, {
        ...payload,
        findings: [
          {
            ...finding,
            positions: [frontend, { ...ux, evidenceIndexes: [1] }],
          },
        ],
      })
    ).toThrow(
      "Comparison evidence index is out of range for specialist ux: 1."
    );
  });

  it("rejects repeated Evidence indexes within a Position", () => {
    expect(() =>
      validateComparisonReferences(context, {
        ...payload,
        findings: [
          {
            ...finding,
            positions: [{ ...frontend, evidenceIndexes: [0, 0, 1] }, ux],
          },
        ],
      })
    ).toThrow(
      "Duplicate comparison evidence index for specialist frontend: 0."
    );
  });

  it("rejects repeated Specialists within a Finding", () => {
    const output = comparisonPayloadSchema.parse({
      ...payload,
      findings: [
        {
          ...finding,
          positions: [frontend, { ...frontend, statement: "Another position" }],
        },
      ],
    });
    expect(() => validateComparisonReferences(context, output)).toThrow(
      "Duplicate specialist in comparison finding: frontend."
    );
  });

  it.each([{ positions: [] }, { positions: [frontend] }])(
    "rejects a Finding with fewer than two Positions: $positions",
    ({ positions }) => {
      const output = comparisonPayloadSchema.parse({
        ...payload,
        findings: [{ ...finding, positions }],
      });
      expect(() => validateComparisonReferences(context, output)).toThrow(
        "Comparison finding requires at least two positions"
      );
    }
  );

  it("rejects an unknown Gap Specialist", () => {
    expect(() =>
      validateComparisonReferences(context, {
        ...payload,
        gaps: [{ ...gap, specialistIds: ["backend"] }],
      })
    ).toThrow("Unknown comparison gap specialist: backend.");
  });

  it("rejects repeated Gap Specialists", () => {
    expect(() =>
      validateComparisonReferences(context, {
        ...payload,
        gaps: [{ ...gap, specialistIds: ["ux", "ux"] }],
      })
    ).toThrow("Duplicate specialist in comparison gap: ux.");
  });

  it("rejects a Gap with no Specialists", () => {
    const output = comparisonPayloadSchema.parse({
      ...payload,
      gaps: [{ ...gap, specialistIds: [] }],
    });
    expect(() => validateComparisonReferences(context, output)).toThrow(
      "Comparison gap requires at least one specialist"
    );
  });

  it("allows an empty Evidence reference array when the source Decision has no Evidence", () => {
    const withoutEvidence = {
      ...context,
      decisions: context.decisions.map((decision) => ({
        ...decision,
        evidence: [],
      })),
    };
    expect(() =>
      validateComparisonReferences(withoutEvidence, {
        ...payload,
        findings: [
          {
            ...finding,
            positions: [
              { ...frontend, evidenceIndexes: [] },
              { ...ux, evidenceIndexes: [] },
            ],
          },
        ],
      })
    ).not.toThrow();
  });

  it("rejects index zero when the source Decision has no Evidence", () => {
    const withoutEvidence = {
      ...context,
      decisions: context.decisions.map((decision) => ({
        ...decision,
        evidence: [],
      })),
    };
    expect(() =>
      validateComparisonReferences(withoutEvidence, {
        ...payload,
        findings: [
          {
            ...finding,
            positions: [{ ...frontend, evidenceIndexes: [0] }, ux],
          },
        ],
      })
    ).toThrow(
      "Comparison evidence index is out of range for specialist frontend: 0."
    );
  });

  it("does not judge statement, concern, relation or rationale semantics", () => {
    expect(() =>
      validateComparisonReferences(context, {
        ...payload,
        findings: [
          {
            ...finding,
            concern: "Unverified shared concern",
            relation: "conflict",
            positions: [
              { ...frontend, statement: "Delete the submit button" },
              ux,
            ],
            rationale: "Unverified logical relationship",
          },
        ],
      })
    ).not.toThrow();
  });
});
