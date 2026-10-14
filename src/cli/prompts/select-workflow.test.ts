import { createInterface } from "node:readline";
import { afterEach, describe, expect, it, vi } from "vitest";

import { selectWorkflow } from "./select-workflow.js";

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

describe("selectWorkflow", () => {
  it.each([["1", "plan-execute"], ["2", "plan"], ["3", "decision"], ["4", "execute"]] as const)("maps %s to %s", async (value, expected) => {
    const close = supplyLines([value]);
    expect(await selectWorkflow()).toBe(expected);
    expect(close).toHaveBeenCalledOnce();
    expect(console.log).toHaveBeenCalledWith(expect.stringContaining("AI Workspace"));
  });
  it("retries invalid input and trims a valid selection", async () => {
    supplyLines(["", "other", "5", " 3 "]);
    expect(await selectWorkflow()).toBe("decision");
    expect(console.error).toHaveBeenCalledWith("Please enter 1, 2, 3, or 4.");
    expect(console.error).toHaveBeenCalledTimes(3);
  });
  it.each([{ values: [] }, { values: ["invalid"] }])("rejects EOF before a valid selection: $values", async ({ values }) => {
    const close = supplyLines(values);
    await expect(selectWorkflow()).rejects.toThrow("Workflow input ended before a valid selection was provided.");
    expect(close).toHaveBeenCalledOnce();
  });
});
