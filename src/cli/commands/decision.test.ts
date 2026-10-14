import { beforeEach, describe, expect, it, vi } from "vitest";

import { runDecision } from "@/application/decision/index.js";

import { runDecisionCommand } from "./decision.js";

vi.mock("@/application/decision/index.js", () => ({ runDecision: vi.fn() }));
const input = { repositoryPath: "/repositories/example", objective: "Evaluate the interface", filePaths: ["src/button.tsx"] };

beforeEach(() => { vi.mocked(runDecision).mockReset(); });

describe("runDecisionCommand", () => {
  it("delegates unchanged input and returns the application result", async () => {
    const result = { snapshot: { repositoryRoot: input.repositoryPath, commitSha: "abc123" }, decisions: [] };
    vi.mocked(runDecision).mockResolvedValue(result);
    expect(await runDecisionCommand(input)).toBe(result);
    expect(runDecision).toHaveBeenCalledOnce();
    expect(vi.mocked(runDecision).mock.calls[0][0]).toBe(input);
  });

  it("propagates application errors unchanged", async () => {
    const error = new Error("Repository path is required.");
    vi.mocked(runDecision).mockRejectedValue(error);
    await expect(runDecisionCommand(input)).rejects.toBe(error);
  });
});
