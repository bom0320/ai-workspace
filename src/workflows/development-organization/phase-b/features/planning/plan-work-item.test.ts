import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, it, vi } from "vitest";

import * as governance from "@/application/governance/index.js";
import type { GoalSpec } from "@/contracts/goal.js";

import type { TaskDraft, Planner } from "@/application/planning/index.js";
import { planWorkItem } from "./plan-work-item.js";

const temporaryDirectories: string[] = [];
const goal: GoalSpec = {
  objective: "Implement the goal",
  targetRepository: "example",
  constraints: ["Keep changes scoped"],
};
const task: TaskDraft = {
  objective: goal.objective,
  targetRepository: goal.targetRepository,
  allowedPaths: ["example.ts"],
  forbiddenPaths: [],
  constraints: goal.constraints!,
  acceptanceCriteria: ["The goal is implemented"],
  verification: ["pnpm test"],
};
const limits = { maxRounds: 3, maxFilesPerRequest: 2, maxTotalFiles: 2 };

function createRepository(): string {
  const root = mkdtempSync(join(tmpdir(), "ai-workspace-plan-task-"));
  temporaryDirectories.push(root);
  mkdirSync(join(root, ".git"));
  writeFileSync(join(root, "example.ts"), "// Example 내용\n");
  writeFileSync(join(root, "AGENTS.md"), "Keep changes minimal");
  writeFileSync(
    join(root, "package.json"),
    '{"scripts":{"test":"vitest run"}}'
  );
  return root;
}

afterEach(() => {
  vi.restoreAllMocks();
  for (const directory of temporaryDirectories.splice(0)) {
    rmSync(directory, { recursive: true });
  }
});

describe("planWorkItem", () => {
  const phaseB = {
    approvedDecisionId: "approved-1",
    workItem: {
      id: "copy",
      objective: "Clarify the messaging in README.md",
      deliverable: "README.md with one revised introduction",
      dependsOn: [],
      rationale: "The wording can be verified independently",
    },
  };
  const originalGoal = { ...goal, objective: "Fix the wording in README.md" };
  const direction = {
    text: "Describe the existing behavior and keep the introductory structure.",
    sources: [{ kind: "recommendation" as const, specialistId: "ux" }],
  };
  const proposal = {
    direction,
    rationale: [direction],
    alternatives: [],
    risks: [],
    tradeoffs: [],
    unresolvedIssues: [],
    humanReviewItems: [direction],
  };

  function restoreApproval(repositoryRoot: string) {
    return vi.spyOn(governance, "getApprovedDecision").mockReturnValue({
      decision: {
        id: phaseB.approvedDecisionId,
        reviewId: "review-1",
        reviewBinding: "binding-1",
        approvalRecordId: "receipt-1",
      },
      review: {
        id: "review-1",
        scopeId: "scope-1",
        scopeVersion: 1,
        analysisDigest: "digest-1",
        proposal,
        revision: 0,
        binding: "binding-1",
      },
      context: {
        goal: originalGoal,
        repositoryCommitSha: "abc",
        assignments: [
          {
            assignmentId: "assignment-1",
            specialistId: "ux",
            objective: "Review wording",
          },
        ],
        decisions: [
          {
            specialistId: "ux",
            recommendation: direction.text,
            evidence: [],
            risks: [],
            uncertainty: [],
          },
        ],
        comparison: { status: "skipped", reason: "insufficient-decisions" },
      },
      snapshot: { repositoryRoot, commitSha: "abc" },
    });
  }

  it("plans the selected Work Item across inspection rounds even when the original Goal qualifies for Fast Path", async () => {
    const repositoryPath = createRepository();
    writeFileSync(join(repositoryPath, "README.md"), "Introduction");
    const lookup = restoreApproval(repositoryPath);
    const planner = vi
      .fn<Planner>()
      .mockResolvedValueOnce({
        type: "inspect",
        request: { paths: ["example.ts"] },
      })
      .mockResolvedValueOnce({
        type: "complete",
        task: {
          ...task,
          targetRepository: "ignored-draft-target",
          objective: phaseB.workItem.objective,
          allowedPaths: ["README.md"],
          constraints: ["Preserve headings"],
        },
      });

    const result = await planWorkItem({
      phaseB,
      repositoryPath,
      limits,
      planner,
    });

    expect(lookup).toHaveBeenCalledExactlyOnceWith(phaseB.approvedDecisionId);
    expect(planner).toHaveBeenCalledTimes(2);
    for (const [state] of planner.mock.calls) {
      expect(state.goal).toEqual(originalGoal);
      expect(state.detail).toEqual({
        objective: phaseB.workItem.objective,
        deliverable: phaseB.workItem.deliverable,
        direction: proposal.direction.text,
      });
    }
    expect(
      planner.mock.calls[0][0].inspectedFiles.map(({ path }) => path)
    ).toEqual(["README.md"]);
    expect(
      planner.mock.calls[1][0].inspectedFiles.map(({ path }) => path)
    ).toEqual(["README.md", "example.ts"]);
    expect(result).toMatchObject({
      status: "completed",
      rounds: 2,
      task: {
        id: expect.stringMatching(/^task-/),
        goalId: expect.stringMatching(/^goal-/),
        objective: phaseB.workItem.objective,
        targetRepository: originalGoal.targetRepository,
        constraints: ["Keep changes scoped", "Preserve headings"],
      },
    });
  });

  it.each([
    { approvedDecisionId: "", workItem: phaseB.workItem },
    { ...phaseB, workItem: { ...phaseB.workItem, deliverable: "" } },
  ])(
    "rejects malformed Phase B input before lookup or planning",
    async (input) => {
      const repositoryPath = createRepository();
      const lookup = vi.spyOn(governance, "getApprovedDecision");
      const planner = vi.fn<Planner>();
      await expect(
        planWorkItem({ phaseB: input, repositoryPath, limits, planner })
      ).rejects.toThrow();
      expect(lookup).not.toHaveBeenCalled();
      expect(planner).not.toHaveBeenCalled();
    }
  );

  it("stops when the approval cannot be restored", async () => {
    const repositoryPath = createRepository();
    vi.spyOn(governance, "getApprovedDecision").mockImplementation(() => {
      throw new Error("ApprovedDecision is unavailable.");
    });
    const planner = vi.fn<Planner>();
    await expect(
      planWorkItem({ phaseB, repositoryPath, limits, planner })
    ).rejects.toThrow("ApprovedDecision is unavailable.");
    expect(planner).not.toHaveBeenCalled();
  });

  it("rejects a repository different from the approval target", async () => {
    const repositoryPath = createRepository();
    restoreApproval(createRepository());
    const planner = vi.fn<Planner>();
    await expect(
      planWorkItem({ phaseB, repositoryPath, limits, planner })
    ).rejects.toThrow(
      "Planning repository does not match the Approved Decision."
    );
    expect(planner).not.toHaveBeenCalled();
  });
});
