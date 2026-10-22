import { describe, expect, it } from "vitest";

import type { SpecialistContext } from "../../protocol/context.js";
import type {
  AgentDecision,
  EvidenceReference,
} from "../../protocol/decision.js";
import { validateDecisionEvidence } from "./validate-evidence.js";

const context: SpecialistContext = {
  goal: { objective: "Review the button", targetRepository: "example" },
  repositoryCommitSha: "abc123",
  files: [{ path: "src/button.tsx", content: "first\nsecond\nthird" }],
};
const evidence: EvidenceReference = {
  path: "src/button.tsx",
  description: "Owns the interaction",
};
const decision: AgentDecision = {
  specialistId: "frontend",
  recommendation: "Keep the interaction accessible",
  evidence: [evidence],
  risks: [],
  uncertainty: [],
};

function withEvidence(reference: EvidenceReference): AgentDecision {
  return { ...decision, evidence: [reference] };
}

describe("validateDecisionEvidence", () => {
  it("accepts supplied file-level evidence", () => {
    expect(() => validateDecisionEvidence(context, decision)).not.toThrow();
  });

  it("accepts a single 1-based line, including the first and last line", () => {
    for (const lineStart of [1, 3]) {
      expect(() =>
        validateDecisionEvidence(
          context,
          withEvidence({ ...evidence, lineStart })
        )
      ).not.toThrow();
    }
  });

  it("accepts a valid line range, including equal start and end", () => {
    for (const range of [
      { lineStart: 1, lineEnd: 3 },
      { lineStart: 2, lineEnd: 2 },
    ]) {
      expect(() =>
        validateDecisionEvidence(
          context,
          withEvidence({ ...evidence, ...range })
        )
      ).not.toThrow();
    }
  });

  it("accepts an empty evidence array even with no supplied files", () => {
    expect(() =>
      validateDecisionEvidence(
        { ...context, files: [] },
        { ...decision, evidence: [] }
      )
    ).not.toThrow();
  });

  it.each([
    "src/modal.tsx",
    "../button.tsx",
    "/absolute/path/button.tsx",
    "./src/button.tsx",
    "src/../src/button.tsx",
    "SRC/button.tsx",
  ])("rejects a path without exact supplied context match: %s", (path) => {
    expect(() =>
      validateDecisionEvidence(context, withEvidence({ ...evidence, path }))
    ).toThrow(`Evidence path was not supplied to the Specialist: ${path}.`);
  });

  it("rejects lineEnd without lineStart", () => {
    expect(() =>
      validateDecisionEvidence(
        context,
        withEvidence({ ...evidence, lineEnd: 2 })
      )
    ).toThrow("lineEnd exists without lineStart");
  });

  it("rejects a reversed line range", () => {
    expect(() =>
      validateDecisionEvidence(
        context,
        withEvidence({ ...evidence, lineStart: 3, lineEnd: 2 })
      )
    ).toThrow("lineStart is greater than lineEnd");
  });

  it("rejects lineStart beyond the supplied file", () => {
    expect(() =>
      validateDecisionEvidence(
        context,
        withEvidence({ ...evidence, lineStart: 4 })
      )
    ).toThrow("lineStart exceeds file line count");
  });

  it("rejects lineEnd beyond the supplied file", () => {
    expect(() =>
      validateDecisionEvidence(
        context,
        withEvidence({ ...evidence, lineStart: 1, lineEnd: 4 })
      )
    ).toThrow("lineEnd exceeds file line count");
  });

  it.each(["\n", "\r\n"])(
    "counts lines from supplied content with %j separators",
    (separator) => {
      const supplied = {
        ...context,
        files: [
          {
            path: evidence.path,
            content: ["first", "second", "third"].join(separator),
          },
        ],
      };
      expect(() =>
        validateDecisionEvidence(
          supplied,
          withEvidence({ ...evidence, lineStart: 1, lineEnd: 3 })
        )
      ).not.toThrow();
      expect(() =>
        validateDecisionEvidence(
          supplied,
          withEvidence({ ...evidence, lineStart: 4 })
        )
      ).toThrow("lineStart exceeds file line count");
    }
  );

  it("counts a trailing newline as a final empty line", () => {
    const supplied = {
      ...context,
      files: [{ path: evidence.path, content: "first\n" }],
    };
    expect(() =>
      validateDecisionEvidence(
        supplied,
        withEvidence({ ...evidence, lineStart: 2 })
      )
    ).not.toThrow();
    expect(() =>
      validateDecisionEvidence(
        supplied,
        withEvidence({ ...evidence, lineStart: 3 })
      )
    ).toThrow("lineStart exceeds file line count");
  });

  it("rejects an invalid reference after a valid one", () => {
    expect(() =>
      validateDecisionEvidence(context, {
        ...decision,
        evidence: [evidence, { ...evidence, path: "src/modal.tsx" }],
      })
    ).toThrow("Evidence path was not supplied to the Specialist");
  });
});
