import { createInterface } from "node:readline";

import { afterEach, describe, expect, it, vi } from "vitest";

import { askExecution } from "./ask-execution.js";

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

describe("askExecution", () => {
  it("asks for the existing task path and repository in execute argument order", async () => {
    const close = supplyLines([" tasks/example.json ", " . "]);
    expect(await askExecution()).toEqual({ taskPath: "tasks/example.json", repositoryPath: "." });
    expect(console.log).toHaveBeenCalledWith("Task path:\n> ");
    expect(console.log).toHaveBeenCalledWith("Repository:\n> ");
    expect(close).toHaveBeenCalledOnce();
  });
  it("retries empty required inputs", async () => {
    supplyLines(["", "task.json", " ", "."]);
    expect(await askExecution()).toEqual({ taskPath: "task.json", repositoryPath: "." });
    expect(console.error).toHaveBeenCalledWith("Task path must not be empty.");
    expect(console.error).toHaveBeenCalledWith("Repository must not be empty.");
  });
  it.each([{ values: [] }, { values: ["task.json"] }])("rejects EOF: $values", async ({ values }) => {
    const close = supplyLines(values);
    await expect(askExecution()).rejects.toThrow("Execution input ended before all required values were provided.");
    expect(close).toHaveBeenCalledOnce();
  });
});
