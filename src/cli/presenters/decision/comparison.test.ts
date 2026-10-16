import { afterEach, expect, it, vi } from "vitest";

import { presentComparison } from "./comparison.js";

afterEach(() => { vi.restoreAllMocks(); });

it("prints Finding concerns, relations, positions and rationale", () => {
  const log = vi.spyOn(console, "log").mockImplementation(() => {});
  presentComparison({ findings: [{
    concern: "Pending submissions", relation: "agreement",
    positions: [
      { specialistId: "frontend", statement: "Disable repeated submission", evidenceIndexes: [0] },
      { specialistId: "ux", statement: "Show pending feedback", evidenceIndexes: [] },
    ],
    rationale: "Both support pending feedback",
  }], gaps: [] });
  const output = log.mock.calls.flat().join("\n");
  for (const text of ["Comparison", "Findings:", "[agreement] Pending submissions",
    "- frontend: Disable repeated submission", "- ux: Show pending feedback",
    "Rationale: Both support pending feedback", "Gaps:\n- (none)"]) expect(output).toContain(text);
});

it("prints Gap concerns, kinds, specialists and reasons", () => {
  const log = vi.spyOn(console, "log").mockImplementation(() => {});
  presentComparison({ findings: [], gaps: [{
    concern: "Touch interaction", kind: "uncertainty", specialistIds: ["frontend", "ux"],
    reason: "Insufficient observations",
  }] });
  const output = log.mock.calls.flat().join("\n");
  for (const text of ["Findings:\n- (none)", "Gaps:", "[uncertainty] Touch interaction",
    "Specialists: frontend, ux", "Reason: Insufficient observations"]) expect(output).toContain(text);
});

it("prints an empty Comparison without creating a recommendation", () => {
  const log = vi.spyOn(console, "log").mockImplementation(() => {});
  presentComparison({ findings: [], gaps: [] });
  expect(log).toHaveBeenCalledExactlyOnceWith("\nComparison: no material relationships found.");
});
