import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  runStaffingApproval,
  type StaffingApprovalWorkflowResult,
} from "@/workflows/development-organization/phase-a/index.js";
import { confirmHumanAction } from "@/infrastructure/terminal/index.js";
import { runStaffingCli } from "./staffing.js";

vi.mock("@/workflows/development-organization/phase-a/index.js", () => ({
  runStaffingApproval: vi.fn(),
}));
vi.mock("@/infrastructure/terminal/index.js", () => ({
  confirmHumanAction: vi.fn(),
}));
let root: string;
const goal = {
  objective: "Review login",
  targetRepository: "repo",
  constraints: ["Keep keyboard navigation", "No edits"],
};
beforeEach(() => {
  vi.resetAllMocks();
  root = mkdtempSync(join(tmpdir(), "staffing-cli-"));
  writeFileSync(join(root, "goal.json"), JSON.stringify(goal));
  vi.spyOn(console, "log").mockImplementation(() => {});
  vi.spyOn(console, "error").mockImplementation(() => {});
});
afterEach(() => {
  vi.restoreAllMocks();
  rmSync(root, { recursive: true, force: true });
});
describe("Staffing workflow CLI", () => {
  it("passes the original Goal and uses the existing review and secure terminal callback", async () => {
    const receipt = { token: "test" };
    vi.mocked(confirmHumanAction).mockReturnValue(receipt);
    vi.mocked(runStaffingApproval).mockImplementation(async (options) => {
      expect(options.goal).toEqual(goal);
      expect(options.repositoryPath).toBe("/repo");
      expect(options.maxRounds).toBe(4);
      expect(
        await options.confirmApproval!({
          status: "approval-required",
          kind: "staffing",
          binding: "binding",
          reason: "No delegation",
          subject: {
            id: "proposal",
            goal,
            snapshot: { repositoryRoot: "/repo", commitSha: "abc" },
            intent: {
              problem: "Login",
              desiredOutcome: "Analysis",
              considerations: [],
              uncertainties: [],
            },
            assignments: [
              {
                assignmentId: "a1",
                specialistId: "frontend",
                objective: "Analyze login",
                contextPaths: ["src/login.ts"],
                rationale: "UI",
              },
            ],
            budget: { maxAgentInvocations: 2 },
            rationale: "Review",
          },
        })
      ).toBe(receipt);
      return { status: "denied", reason: "Test ends after confirmation" };
    });
    expect(await runStaffingCli(["/repo", join(root, "goal.json")])).toBe(1);
    const [binding, review] = vi.mocked(confirmHumanAction).mock.calls[0];
    expect(binding).toBe("binding");
    for (const text of [
      goal.objective,
      ...goal.constraints,
      "frontend",
      "src/login.ts",
      "Invocation Budget: 2",
      "No delegation",
    ])
      expect(review).toContain(text);
  });
  it.each([
    "approved",
    "denied",
    "rejected",
    "escalated",
    "failed",
    "approval-required",
  ] as const)(
    "prints %s and returns success only for issued Scope",
    async (status) => {
      const result = {
        status,
        reason: "test",
        questions: ["Which direction?"],
      } as StaffingApprovalWorkflowResult;
      vi.mocked(runStaffingApproval).mockResolvedValue(result);
      expect(await runStaffingCli(["/repo", join(root, "goal.json")])).toBe(
        status === "approved" ? 0 : 1
      );
      expect(console.log).toHaveBeenCalledWith(JSON.stringify(result, null, 2));
      expect(confirmHumanAction).not.toHaveBeenCalled();
    }
  );
  it("fails closed before terminal confirmation on malformed review data", async () => {
    vi.mocked(confirmHumanAction).mockReturnValue(null);
    vi.mocked(runStaffingApproval).mockImplementation(
      async ({ confirmApproval }) => {
        await confirmApproval!({
          status: "approval-required",
          kind: "staffing",
          binding: "binding",
          reason: "Review",
          subject: null,
        });
        return { status: "rejected", reason: "No receipt" };
      }
    );
    expect(await runStaffingCli(["/repo", join(root, "goal.json")])).toBe(1);
    expect(confirmHumanAction).not.toHaveBeenCalled();
    expect(console.error).toHaveBeenCalled();
  });
  it("rejects invalid Goal and argument input before starting the workflow", async () => {
    for (const args of [
      [],
      ["/repo"],
      ["/repo", join(root, "goal.json"), "extra"],
    ])
      expect(await runStaffingCli(args)).toBe(1);
    writeFileSync(
      join(root, "goal.json"),
      JSON.stringify({ ...goal, constraints: [""] })
    );
    expect(await runStaffingCli(["/repo", join(root, "goal.json")])).toBe(1);
    expect(runStaffingApproval).not.toHaveBeenCalled();
  });
});
