import { afterEach, expect, it, vi } from "vitest";

import type { AgentDecision } from "@/application/decision/index.js";

import { presentDecisions } from "./decisions.js";

afterEach(() => {
  vi.restoreAllMocks();
});

it("prints individual recommendations, evidence ranges, risks and uncertainty without synthesis", () => {
  const log = vi.spyOn(console, "log").mockImplementation(() => {});
  const snapshot = {
    repositoryRoot: "/repositories/example",
    commitSha: "abc123",
  };
  const decisions: AgentDecision[] = [
    {
      specialistId: "frontend",
      recommendation: "Inspect implementation",
      evidence: [
        {
          path: "src/button.tsx",
          lineStart: 10,
          lineEnd: 20,
          description: "Owns interaction",
        },
        { path: "src/button.tsx", lineStart: 5, description: "Specific line" },
        { path: "README.md", description: "Project description" },
      ],
      risks: ["Implementation risk"],
      uncertainty: ["Missing runtime evidence"],
    },
    {
      specialistId: "ux",
      recommendation: "Inspect usability",
      evidence: [],
      risks: [],
      uncertainty: [],
    },
  ];
  const before = structuredClone({ snapshot, decisions });
  presentDecisions(snapshot, decisions);
  const output = log.mock.calls.flat().join("\n");
  for (const text of [
    "Snapshot: abc123",
    "Specialists: 2",
    "[Frontend Specialist]",
    "[UX Specialist]",
    "Recommendation:\nInspect implementation",
    "src/button.tsx:10-20",
    "src/button.tsx:5",
    "README.md",
    "Owns interaction",
    "Risks:\n- Implementation risk",
    "Uncertainty:\n- Missing runtime evidence",
    "- (none)",
  ]) {
    expect(output).toContain(text);
  }
  expect({ snapshot, decisions }).toEqual(before);
});
