import { createInterface } from "node:readline";

import { afterEach, describe, expect, it, vi } from "vitest";

import { askDecision } from "./ask-decision.js";

vi.mock("node:readline", () => ({ createInterface: vi.fn() }));

function supplyLines(values: string[]) {
  const close = vi.fn();
  vi.mocked(createInterface).mockReturnValue({
    close,
    async *[Symbol.asyncIterator]() {
      yield* values;
    },
  } as unknown as ReturnType<typeof createInterface>);
  vi.spyOn(console, "log").mockImplementation(() => {});
  vi.spyOn(console, "error").mockImplementation(() => {});
  return close;
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe("askDecision", () => {
  it("reads trimmed repository, objective and multiple files in input order", async () => {
    const close = supplyLines([
      " . ",
      " Review UI ",
      " src/foo.ts ",
      "src/bar.ts",
      "",
    ]);
    expect(await askDecision()).toEqual({
      repositoryPath: ".",
      objective: "Review UI",
      filePaths: ["src/foo.ts", "src/bar.ts"],
    });
    expect(console.log).toHaveBeenCalledWith("Repository:\n> ");
    expect(console.log).toHaveBeenCalledWith("Decision Goal:\n> ");
    expect(close).toHaveBeenCalledOnce();
  });
  it("retries empty repository, objective and empty file collection", async () => {
    supplyLines(["", ".", " ", "Review UI", "", "src/foo.ts", ""]);
    expect(await askDecision()).toEqual({
      repositoryPath: ".",
      objective: "Review UI",
      filePaths: ["src/foo.ts"],
    });
    for (const message of [
      "Repository must not be empty.",
      "Decision Goal must not be empty.",
      "At least one context file is required.",
    ]) {
      expect(console.error).toHaveBeenCalledWith(message);
    }
  });
  it("leaves path validation to the application", async () => {
    supplyLines([".", "Review", "/absolute.ts", "../outside.ts", ""]);
    expect((await askDecision()).filePaths).toEqual([
      "/absolute.ts",
      "../outside.ts",
    ]);
  });
  it.each([
    { values: [] },
    { values: ["."] },
    { values: [".", "Review"] },
    { values: [".", "Review", "file.ts"] },
  ])("rejects incomplete input on EOF: $values", async ({ values }) => {
    const close = supplyLines(values);
    await expect(askDecision()).rejects.toThrow(
      "Decision input ended before all required values were provided."
    );
    expect(close).toHaveBeenCalledOnce();
  });
});
