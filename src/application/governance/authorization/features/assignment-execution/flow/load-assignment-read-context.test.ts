import { beforeEach, expect, it, vi } from "vitest";
import { loadSnapshotFiles } from "@/application/decision/index.js";
import {
  listRepositoryFilesAtCommit,
  type CommitFile,
} from "@/infrastructure/git/index.js";
import { assertRepositoryMatchesSnapshot } from "@/services/repository-snapshot/index.js";
import { loadAssignmentReadContext } from "./load-assignment-read-context.js";

vi.mock("@/application/decision/index.js", async () => ({
  agentDecisionSchema: (
    await import("@/application/decision/protocol/decision.js")
  ).agentDecisionSchema,
  loadSnapshotFiles: vi.fn(),
}));
vi.mock("@/infrastructure/git/index.js", () => ({
  listRepositoryFilesAtCommit: vi.fn(),
}));
vi.mock("@/services/repository-snapshot/index.js", () => ({
  assertRepositoryMatchesSnapshot: vi.fn(),
}));

const snapshot = { repositoryRoot: "/repo", commitSha: "a".repeat(40) };
const source = {
  snapshot,
  goal: { objective: "Review", targetRepository: "repo" },
  approvedDirection: "Approved review",
  workItem: { id: "review", objective: "Review", deliverable: "Notes" },
  assignment: { objective: "Inspect", deliverable: "Findings" },
} as Parameters<typeof loadAssignmentReadContext>[0];

function blob(path: string, size = 4): CommitFile {
  return { path, mode: "100644", size };
}

beforeEach(() => {
  vi.resetAllMocks();
  vi.mocked(loadSnapshotFiles).mockImplementation((_snapshot, paths) =>
    paths.map((path) => ({ path, content: "text" }))
  );
});

it("provides metadata and blobs only for regular files inside approved directories", () => {
  vi.mocked(listRepositoryFilesAtCommit).mockReturnValue([
    blob("AGENTS.md"),
    blob("package.json"),
    blob("docs/AGENTS.md"),
    blob("docs/package.json"),
    blob("docs-extra/README.md"),
    blob("docs/.aws/config"),
    { ...blob("docs/link"), mode: "120000" },
  ]);
  const result = loadAssignmentReadContext(
    source,
    [{ kind: "directory", path: "docs" }],
    () => 1000
  );
  expect(result.repositoryFiles).toEqual([
    { path: "docs/AGENTS.md", size: 4 },
    { path: "docs/package.json", size: 4 },
  ]);
  expect(result.files.map(({ path }) => path)).toEqual([
    "docs/AGENTS.md",
    "docs/package.json",
  ]);
  expect(assertRepositoryMatchesSnapshot).toHaveBeenCalledWith(snapshot);
});

it.each(["docs/.env", "docs/link", "docs/missing"])(
  "rejects an explicit scope for %s before opening a blob",
  (path) => {
    vi.mocked(listRepositoryFilesAtCommit).mockReturnValue([
      blob("docs/.env"),
      { ...blob("docs/link"), mode: "120000" },
    ]);
    expect(() =>
      loadAssignmentReadContext(source, [{ kind: "file", path }], () => 1000)
    ).toThrow("authority");
    expect(loadSnapshotFiles).not.toHaveBeenCalled();
  }
);

it.each([
  [blob("docs/large.md", 16 * 1024 + 1)],
  Array.from({ length: 33 }, (_, index) => blob(`docs/${index}.md`)),
  Array.from({ length: 5 }, (_, index) => blob(`docs/${index}.md`, 16 * 1024)),
])(
  "rejects out-of-budget Snapshot collections before opening blobs",
  (...files) => {
    vi.mocked(listRepositoryFilesAtCommit).mockReturnValue(files);
    expect(() =>
      loadAssignmentReadContext(
        source,
        [{ kind: "directory", path: "docs" }],
        () => 1000
      )
    ).toThrow("validation");
    expect(loadSnapshotFiles).not.toHaveBeenCalled();
  }
);

it("checks actual serialized bytes and stops before loading more files after expiry", () => {
  vi.mocked(listRepositoryFilesAtCommit).mockReturnValue([
    blob("docs/one"),
    blob("docs/two"),
  ]);
  const scopes = [{ kind: "directory" as const, path: "docs" }];
  expect(() =>
    loadAssignmentReadContext(
      { ...source, approvedDirection: "é".repeat(32768) },
      scopes,
      () => 1000
    )
  ).toThrow("validation");
  vi.mocked(loadSnapshotFiles).mockClear();
  const check = vi
    .fn()
    .mockImplementationOnce(() => 1000)
    .mockImplementationOnce(() => 1000)
    .mockImplementationOnce(() => 1000)
    .mockImplementationOnce(() => {
      throw new Error("expired");
    });
  expect(() => loadAssignmentReadContext(source, scopes, check)).toThrow(
    "expired"
  );
  expect(loadSnapshotFiles).toHaveBeenCalledExactlyOnceWith(
    snapshot,
    ["docs/one"],
    { timeoutMs: 1000, ignoreReplaceObjects: true }
  );
});
