import { expect, it, vi } from "vitest";
import type { Planner } from "@/application/planning/index.js";
import { getApprovedDecision } from "@/application/governance/index.js";
import { executeWorkItemPlanning } from "./execute-work-item-planning.js";

vi.mock("@/application/governance/index.js", () => ({
  getApprovedDecision: vi.fn(),
}));

it("blocks direct Phase B Detailed Planning before reading the repository or invoking the Planner", async () => {
  const planner = vi.fn<Planner>();
  await expect(
    executeWorkItemPlanning({
      phaseB: {
        approvedDecisionId: "approved-1",
        workItem: {
          id: "copy",
          objective: "Clarify README.md",
          deliverable: "Revised introduction",
          dependsOn: [],
        },
      },
      repositoryPath: "/unavailable",
      limits: { maxRounds: 3, maxFilesPerRequest: 2, maxTotalFiles: 2 },
      planner,
    })
  ).rejects.toThrow("Assignment-bound authorization");
  expect(getApprovedDecision).not.toHaveBeenCalled();
  expect(planner).not.toHaveBeenCalled();
});
