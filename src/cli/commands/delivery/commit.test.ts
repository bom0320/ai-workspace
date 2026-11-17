import { expect, it } from "vitest";

import { isValidCommitMessage } from "./commit.js";
it.each([
  "docs: update README",
  "fix(planning): reject traversal",
  "feat: add entry",
  "refactor(cli): separate delivery flow",
  "perf: faster",
  "test: coverage",
  "chore: maintenance",
])("accepts %s", (message) => expect(isValidCommitMessage(message)).toBe(true));
it.each([
  "hello",
  "unknown: test",
  "feat:",
  "feat: ",
  "feat:    ",
  "docs: update\nREADME",
  "docs: update\rREADME",
  "fix(): subject",
  "feat:subject",
])("rejects %s", (message) =>
  expect(isValidCommitMessage(message)).toBe(false)
);
