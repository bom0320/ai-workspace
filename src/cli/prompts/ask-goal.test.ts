import { createInterface } from "node:readline";
import { afterEach, describe, expect, it, vi } from "vitest";

import { askGoal } from "./ask-goal.js";

vi.mock("node:readline", () => ({ createInterface: vi.fn() }));

function supplyLines(values: string[]) {
  const close = vi.fn();
  vi.mocked(createInterface).mockReturnValue({
    close,
    async *[Symbol.asyncIterator]() { yield* values; },
  } as unknown as ReturnType<typeof createInterface>);
  vi.spyOn(console, "log").mockImplementation(() => {});
  vi.spyOn(console, "error").mockImplementation(() => {});
  return close;
}

afterEach(() => { vi.restoreAllMocks(); });

describe("askGoal", () => {
  it("reads and trims repository and objective input", async () => {
    const close = supplyLines([" . ", " Clarify README "]);
    expect(await askGoal()).toEqual({ repositoryPath: ".", objective: "Clarify README" });
    expect(console.log).toHaveBeenCalledWith("AI Workspace");
    expect(console.log).toHaveBeenCalledWith("Repository:\n> ");
    expect(console.log).toHaveBeenCalledWith("Goal:\n> ");
    expect(close).toHaveBeenCalledOnce();
  });

  it("repeats each prompt until a non-empty value is entered", async () => {
    supplyLines(["", "  ", ".", "\t", "Clarify README"]);
    expect(await askGoal()).toEqual({ repositoryPath: ".", objective: "Clarify README" });
    expect(console.error).toHaveBeenCalledWith("Repository must not be empty.");
    expect(console.error).toHaveBeenCalledWith("Goal must not be empty.");
  });

  it.each([{ values: [] }, { values: ["."] }])("rejects incomplete input on EOF: $values", async ({ values }) => {
    const close = supplyLines(values);
    await expect(askGoal()).rejects.toThrow("Goal input ended before all required values were provided.");
    expect(close).toHaveBeenCalledOnce();
  });
});
