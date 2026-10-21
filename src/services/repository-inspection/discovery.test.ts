import { describe, expect, it } from "vitest";

import {
  isRepositoryRelativePath,
  isUnambiguousRepositoryPath,
  parsePackageScripts,
  selectGoalMentionedPaths,
} from "./index.js";

describe("shared Repository inspection policies", () => {
  const tree = ["README.md", "src/a/login.ts", "src/b/login.ts", "src/button.tsx", "docs/design.md"];

  it("reuses v1 exact-path, unique-basename and README mention selection", () => {
    expect(selectGoalMentionedPaths(tree, "Review login.ts and button.tsx plus README"))
      .toEqual(["README.md", "src/button.tsx"]);
    expect(selectGoalMentionedPaths(tree, "Review src/a/login.ts and src\\b\\login.ts"))
      .toEqual(["src/a/login.ts", "src/b/login.ts"]);
    expect(selectGoalMentionedPaths(tree, "Review login or button.tsx.backup"))
      .toEqual([]);
  });

  it("preserves metadata parsing semantics for absent, invalid and non-string scripts", () => {
    for (const input of [undefined, "null", "[]", '{}', '{"scripts":[]}']) {
      expect(parsePackageScripts(input)).toEqual({});
    }
    expect(parsePackageScripts('{"scripts":{"test":"vitest", "number":1, "empty":""}}'))
      .toEqual({ test: "vitest", empty: "" });
    expect(() => parsePackageScripts("{invalid")).toThrow(SyntaxError);
  });

  it.each(["", "  ", "/file", "C:\\file", "\\\\host\\share", "../file", "src/../file", "..\\file"])(
    "rejects unsafe paths consistently: %j", (path) => {
      expect(isRepositoryRelativePath(path)).toBe(false);
      expect(isUnambiguousRepositoryPath(path)).toBe(false);
    },
  );

  it("keeps v2's broader spelling contract while Governance and Staffing require canonical paths", () => {
    for (const path of ["src/./file", "src//file", "src\\file", "src/file\0", "C:file"]) {
      expect(isRepositoryRelativePath(path)).toBe(true);
      expect(isUnambiguousRepositoryPath(path)).toBe(false);
    }
    expect(isUnambiguousRepositoryPath("docs/interaction notes.md")).toBe(true);
  });
});
