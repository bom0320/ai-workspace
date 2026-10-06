import { describe, expect, it } from "vitest";

import { checkScope } from "./scope-enforcement.js";

describe("checkScope", () => {
  it("passes when every changed path is allowed", () => {
    expect(
      checkScope(
        ["src/cli.ts", "src/cli.test.ts"],
        ["src/cli.ts", "src/cli.test.ts"],
        [],
      ),
    ).toEqual({ passed: true, violations: [] });
  });

  it("fails when a changed path is not allowed", () => {
    expect(checkScope(["README.md"], ["src/cli.ts"], [])).toEqual({
      passed: false,
      violations: ["README.md"],
    });
  });

  it("does not treat an allowed directory as a path prefix", () => {
    expect(checkScope(["src/cli.ts"], ["src/"], [])).toEqual({
      passed: false,
      violations: ["src/cli.ts"],
    });
  });

  it("fails when a changed path is forbidden", () => {
    expect(
      checkScope(
        ["docs/architecture.md"],
        ["docs/architecture.md"],
        ["docs/architecture.md"],
      ),
    ).toEqual({ passed: false, violations: ["docs/architecture.md"] });
  });

  it("gives forbidden paths priority over allowed paths", () => {
    expect(
      checkScope(
        ["src/cli.ts"],
        ["src/cli.ts"],
        ["src/cli.ts"],
      ),
    ).toEqual({ passed: false, violations: ["src/cli.ts"] });
  });

  it("returns every violation in deterministic order", () => {
    expect(
      checkScope(
        ["z-last.ts", "a-first.ts", "src/allowed.ts"],
        ["src/allowed.ts"],
        [],
      ),
    ).toEqual({
      passed: false,
      violations: ["a-first.ts", "z-last.ts"],
    });
  });

  it("passes when there are no changed paths", () => {
    expect(checkScope([], [], ["README.md"])).toEqual({
      passed: true,
      violations: [],
    });
  });

  it("returns each violation only once", () => {
    expect(
      checkScope(["README.md", "README.md"], [], ["README.md"]),
    ).toEqual({ passed: false, violations: ["README.md"] });
  });
});
