import { describe, expect, expectTypeOf, it } from "vitest";

import type { ComparisonResult } from "../model/comparison.js";
import {
  comparisonPayloadSchema,
  type ComparisonPayload,
} from "./comparison.js";

const position = {
  specialistId: "frontend",
  statement: "Keep keyboard navigation",
  evidenceIndexes: [0],
};
const finding = {
  concern: "Keyboard navigation",
  relation: "agreement",
  positions: [position, { ...position, specialistId: "ux" }],
  rationale: "Both positions support keyboard access",
};
const gap = {
  concern: "Touch behavior",
  kind: "uncertainty",
  specialistIds: ["ux"],
  reason: "No touch observation",
};
const payload = { findings: [finding], gaps: [gap] };

describe("comparisonPayloadSchema", () => {
  it("infers the Domain shape without treating structural validity as reference validity", () => {
    expectTypeOf<ComparisonPayload>().toEqualTypeOf<ComparisonResult>();
    expect(comparisonPayloadSchema.parse(payload)).toEqual(payload);
  });

  it.each(["agreement", "conflict", "trade-off"])(
    "accepts relation %s",
    (relation) => {
      expect(
        comparisonPayloadSchema.safeParse({
          ...payload,
          findings: [{ ...finding, relation }],
        }).success
      ).toBe(true);
    }
  );

  it.each(["uncertainty", "limitation", "separate-concern"])(
    "accepts gap kind %s",
    (kind) => {
      expect(
        comparisonPayloadSchema.safeParse({
          ...payload,
          gaps: [{ ...gap, kind }],
        }).success
      ).toBe(true);
    }
  );

  it("accepts empty result collections", () => {
    expect(comparisonPayloadSchema.parse({ findings: [], gaps: [] })).toEqual({
      findings: [],
      gaps: [],
    });
  });

  it.each([
    { ...payload, findings: [{ ...finding, relation: "uncertainty" }] },
    { ...payload, gaps: [{ ...gap, kind: "conflict" }] },
    { ...payload, findings: [{ ...finding, relation: "unknown" }] },
    { ...payload, gaps: [{ ...gap, kind: "unknown" }] },
    { ...payload, findings: [{ ...finding, concern: "" }] },
    { ...payload, findings: [{ ...finding, rationale: "" }] },
    {
      ...payload,
      findings: [
        { ...finding, positions: [{ ...position, specialistId: "" }] },
      ],
    },
    {
      ...payload,
      findings: [{ ...finding, positions: [{ ...position, statement: "" }] }],
    },
    {
      ...payload,
      findings: [
        { ...finding, positions: [{ ...position, evidenceIndexes: [-1] }] },
      ],
    },
    {
      ...payload,
      findings: [
        { ...finding, positions: [{ ...position, evidenceIndexes: [0.5] }] },
      ],
    },
    {
      ...payload,
      findings: [
        { ...finding, positions: [{ ...position, evidenceIndexes: ["0"] }] },
      ],
    },
    { ...payload, gaps: [{ ...gap, concern: "" }] },
    { ...payload, gaps: [{ ...gap, specialistIds: [""] }] },
    { ...payload, gaps: [{ ...gap, reason: "" }] },
    { ...payload, findings: {} },
    { ...payload, gaps: null },
    { ...payload, findings: [null] },
    { ...payload, gaps: ["invalid"] },
    { ...payload, findings: [{ ...finding, positions: {} }] },
    { ...payload, gaps: [{ ...gap, specialistIds: "ux" }] },
    { findings: [] },
    { gaps: [] },
    null,
  ])("rejects malformed or invalid protocol data: %j", (output) => {
    expect(comparisonPayloadSchema.safeParse(output).success).toBe(false);
  });

  it.each([
    { ...payload, winner: "frontend" },
    { ...payload, findings: [{ ...finding, severity: "high" }] },
    {
      ...payload,
      findings: [{ ...finding, positions: [{ ...position, confidence: 1 }] }],
    },
    { ...payload, gaps: [{ ...gap, priority: "high" }] },
  ])("rejects extra fields at every object level: %j", (output) => {
    expect(comparisonPayloadSchema.safeParse(output).success).toBe(false);
  });

  it("accepts unknown specialists, out-of-range references and repeated specialists for later validation", () => {
    const unknown = {
      ...position,
      specialistId: "backend",
      evidenceIndexes: [0, 999],
    };
    const output = {
      findings: [{ ...finding, positions: [unknown, unknown] }],
      gaps: [{ ...gap, specialistIds: ["unknown", "unknown"] }],
    };
    expect(comparisonPayloadSchema.parse(output)).toEqual(output);
  });
});
