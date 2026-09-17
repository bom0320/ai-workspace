import { describe, expect, it } from "vitest";

import { banner } from "./cli.js";

describe("CLI", () => {
  it("exposes the v0 banner", () => {
    expect(banner).toBe("AI Workspace v0");
  });
});
