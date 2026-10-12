import { afterEach, describe, expect, it, vi } from "vitest";
import { presentTiming } from "./timing.js";

afterEach(() => { vi.restoreAllMocks(); });

describe("presentTiming", () => {
  it("shows stage durations in seconds and distinguishes Human approval wait", () => {
    const log = vi.spyOn(console, "log").mockImplementation(() => {});
    presentTiming({ planningDurationMs: 18400, approvalWaitDurationMs: 6200,
      workspaceDurationMs: 800, workerDurationMs: 42700, verificationDurationMs: 11300,
      cleanupDurationMs: 400, totalDurationMs: 79800 });
    for (const text of ["Planning: 18.4s", "Approval Wait: 6.2s", "Workspace: 0.8s",
      "Worker: 42.7s", "Verification: 11.3s", "Cleanup: 0.4s", "Total: 79.8s"]) {
      expect(log).toHaveBeenCalledWith(text);
    }
  });
  it("omits stages which were never run", () => {
    const log = vi.spyOn(console, "log").mockImplementation(() => {});
    presentTiming({ planningDurationMs: 0, totalDurationMs: 0 });
    expect(log).toHaveBeenCalledWith("Planning: 0.0s");
    expect(log.mock.calls.flat().join("\n")).not.toContain("Worker:");
  });
});
