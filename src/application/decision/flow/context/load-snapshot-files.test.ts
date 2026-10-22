import { beforeEach, describe, expect, it, vi } from "vitest";

import { readRepositoryFileAtCommit } from "@/infrastructure/git/index.js";

import type { RepositorySnapshot } from "../../model/snapshot.js";
import { loadSnapshotFiles } from "./load-snapshot-files.js";

vi.mock("@/infrastructure/git/index.js", () => ({
  readRepositoryFileAtCommit: vi.fn(),
}));
const readFileMock = vi.mocked(readRepositoryFileAtCommit);
const snapshot: RepositorySnapshot = {
  repositoryRoot: "/repositories/example",
  commitSha: "abc123",
};

beforeEach(() => {
  readFileMock.mockReset();
});

describe("loadSnapshotFiles", () => {
  it("loads multiple files from the Snapshot commit and preserves their exact path strings", () => {
    const paths = ["src/button.tsx", "docs/interaction notes.md"];
    readFileMock
      .mockReturnValueOnce("implementation")
      .mockReturnValueOnce("specification");
    expect(loadSnapshotFiles(snapshot, paths)).toEqual([
      { path: paths[0], content: "implementation" },
      { path: paths[1], content: "specification" },
    ]);
    expect(readFileMock).toHaveBeenNthCalledWith(
      1,
      snapshot.repositoryRoot,
      snapshot.commitSha,
      paths[0]
    );
    expect(readFileMock).toHaveBeenNthCalledWith(
      2,
      snapshot.repositoryRoot,
      snapshot.commitSha,
      paths[1]
    );
  });

  it.each([
    "",
    "   ",
    "/absolute/path.ts",
    "C:\\outside.ts",
    "\\\\host\\share\\file.ts",
    "../outside.ts",
    "src/../../outside.ts",
    "src/../button.tsx",
    "..\\outside.ts",
  ])("rejects invalid paths before reading any file: %j", (path) => {
    expect(() => loadSnapshotFiles(snapshot, ["src/button.tsx", path])).toThrow(
      "repository-relative path without traversal"
    );
    expect(readFileMock).not.toHaveBeenCalled();
  });

  it("propagates a missing file error", () => {
    const error = new Error("Unable to read repository file at commit");
    readFileMock.mockImplementation(() => {
      throw error;
    });
    expect(() => loadSnapshotFiles(snapshot, ["missing.ts"])).toThrow(error);
  });
});
