import { expect, it } from "vitest";
import { assignmentExecutionRequestSchema } from "./assignment-execution.js";

const request = {
  planId: "a".repeat(64),
  assignmentId: "assignment",
  timeoutMs: 5000,
};

it("parses directory and file read scopes and a separate write binding request", () => {
  expect(
    assignmentExecutionRequestSchema.parse({
      ...request,
      access: "read",
      readScopes: [
        { kind: "directory", path: "docs" },
        { kind: "file", path: "README.md" },
      ],
    })
  ).toMatchObject({ access: "read" });
  expect(
    assignmentExecutionRequestSchema.parse({
      ...request,
      access: "write",
      readPaths: [],
      taskContractBinding: "b".repeat(64),
    })
  ).toMatchObject({ access: "write" });
});

it.each([
  { access: "read", readScopes: [] },
  { access: "read", readScopes: [{ kind: "directory", path: "../outside" }] },
  { access: "read", readScopes: [{ kind: "file", path: ".git/config" }] },
  {
    access: "read",
    readScopes: [{ kind: "file", path: "README.md" }],
    authority: { repositoryAccess: "write", shellExecution: false },
  },
  {
    access: "read",
    readScopes: [{ kind: "file", path: "README.md" }],
    workerMode: "codex-worktree",
  },
  {
    access: "read",
    readScopes: [{ kind: "file", path: "README.md" }],
    specialistId: "forged",
  },
  { access: "write", readPaths: [] },
  {
    access: "write",
    readPaths: [],
    taskContractBinding: "b".repeat(64),
    writePaths: ["README.md"],
  },
  { readPaths: ["README.md"] },
])("rejects unauthorized or malformed request fields %j", (input) => {
  expect(
    assignmentExecutionRequestSchema.safeParse({ ...request, ...input }).success
  ).toBe(false);
});
