import { describe, expect, it, vi } from "vitest";

import { runCli } from "./cli.js";

describe("CLI", () => {
  it("rejects a missing Task file argument", () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => {});

    expect(runCli([])).toBe(1);
    expect(error).toHaveBeenCalledWith("Error: Task file path is required.");

    error.mockRestore();
  });

  it("rejects a missing Repository path argument", () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => {});

    expect(runCli(["task.json"])).toBe(1);
    expect(error).toHaveBeenCalledWith("Error: Repository path is required.");

    error.mockRestore();
  });
});
