import { beforeEach, expect, it, vi } from "vitest";
import {
  listRepositoryFilesAtCommit,
  type CommitFile,
} from "@/infrastructure/git/index.js";
import {
  assertRepositoryMatchesSnapshot,
  loadSnapshotFiles,
} from "@/services/repository-snapshot/index.js";
import { loadAssignmentReadContext } from "./load-assignment-read-context.js";

vi.mock("@/infrastructure/git/index.js", () => ({
  listRepositoryFilesAtCommit: vi.fn(),
}));
vi.mock("@/services/repository-snapshot/index.js", () => ({
  assertRepositoryMatchesSnapshot: vi.fn(),
  loadSnapshotFiles: vi.fn(),
}));

const snapshot = { repositoryRoot: "/repo", commitSha: "a".repeat(40) };
const source = {
  snapshot,
  context: { goal: { objective: "Review", targetRepository: "repo" } },
  synthesisProposal: { direction: { text: "Approved review" } },
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

it("shares only cited evidence locations for files already provided by the Claim", () => {
  const cited = {
    ...source,
    context: {
      ...source.context,
      decisions: [
        {
          specialistId: "reviewer",
          recommendation: "Do not transfer this recommendation",
          risks: [],
          uncertainty: [],
          evidence: [
            {
              path: "docs/allowed.md",
              lineStart: 1,
              description: "Prior analysis text",
            },
            {
              path: "private.md",
              lineStart: 1,
              description: "Private analysis text",
            },
          ],
        },
      ],
    },
    workItem: {
      ...source.workItem,
      sources: [
        { kind: "evidence" as const, specialistId: "reviewer", index: 0 },
        { kind: "evidence" as const, specialistId: "reviewer", index: 1 },
        { kind: "recommendation" as const, specialistId: "reviewer" },
      ],
    },
  };
  vi.mocked(listRepositoryFilesAtCommit).mockReturnValue([
    blob("docs/allowed.md"),
    blob("private.md"),
  ]);
  const result = loadAssignmentReadContext(
    cited,
    [{ kind: "directory", path: "docs" }],
    () => 1000
  );
  expect(result.analysisEvidence).toEqual([
    { path: "docs/allowed.md", lineStart: 1 },
  ]);
  expect(JSON.stringify(result)).not.toMatch(
    /private\.md|Prior analysis text|Private analysis text|Do not transfer/
  );
  expect(loadSnapshotFiles).toHaveBeenCalledOnce();
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
      {
        ...source,
        synthesisProposal: {
          ...source.synthesisProposal,
          direction: {
            ...source.synthesisProposal.direction,
            text: "é".repeat(32768),
          },
        },
      },
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

it("retains the cumulative file budget across approved inspections", () => {
  const entries = Array.from({ length: 33 }, (_, index) =>
    blob(`docs/${index}.md`)
  );
  const scopes = [{ kind: "directory" as const, path: "docs" }];
  vi.mocked(listRepositoryFilesAtCommit).mockReturnValue(entries);
  const initial = loadAssignmentReadContext(
    source,
    scopes,
    () => 1000,
    entries.slice(0, 32).map(({ path }) => path)
  );
  expect(initial.files).toHaveLength(32);
  expect(() =>
    loadAssignmentReadContext(
      source,
      scopes,
      () => 1000,
      ["docs/32.md"],
      initial
    )
  ).toThrow("validation");
  expect(loadSnapshotFiles).toHaveBeenCalledTimes(32);
});

it("counts already supplied context bytes when loading more files", () => {
  const entries = Array.from({ length: 4 }, (_, index) =>
    blob(`docs/${index}.md`, 16 * 1024)
  );
  const scopes = [{ kind: "directory" as const, path: "docs" }];
  vi.mocked(listRepositoryFilesAtCommit).mockReturnValue(entries);
  vi.mocked(loadSnapshotFiles).mockImplementation((_snapshot, paths) =>
    paths.map((path) => ({ path, content: "a".repeat(16 * 1024) }))
  );
  const initial = loadAssignmentReadContext(
    source,
    scopes,
    () => 1000,
    entries.slice(0, 3).map(({ path }) => path)
  );
  expect(() =>
    loadAssignmentReadContext(
      source,
      scopes,
      () => 1000,
      ["docs/3.md"],
      initial
    )
  ).toThrow("validation");
  expect(initial.files).toHaveLength(3);
});
