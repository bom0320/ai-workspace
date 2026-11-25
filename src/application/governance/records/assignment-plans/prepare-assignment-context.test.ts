import { governanceDigest } from "@/services/governance-records/index.js";
import { expect, it, vi } from "vitest";
import { resolveExecutionHandoff } from "../../approval/features/execution-delegation/flow/verify-execution-handoff.js";
import { prepareAssignmentContext } from "./prepare-assignment-context.js";

vi.mock(
  "../../approval/features/execution-delegation/flow/verify-execution-handoff.js",
  () => ({
    resolveExecutionHandoff: vi.fn(),
  })
);
vi.mock("@/services/repository-snapshot/index.js", () => ({
  assertRepositoryMatchesSnapshot: vi.fn(),
}));

const specialist = {
  id: "reviewer",
  role: "Reviewer",
  objective: "Review changes",
  authority: { repositoryAccess: "read", shellExecution: false },
};

function setup({
  ambiguous = false,
  disjoint = false,
  workerMode = true,
} = {}) {
  const grant = {
    readPaths: [disjoint ? "outside/README.md" : "docs/README.md"],
    writePaths: [disjoint ? "outside/README.md" : "docs/README.md"],
    workerMode: workerMode ? "codex-worktree" : undefined,
    expiresAt: "2099-01-01T00:00:00Z",
  };
  const policy = {
    readScopes: [{ kind: "directory", path: "docs" }],
    writeScopes: [{ kind: "directory", path: "docs" }],
    workerMode: "codex-worktree",
  };
  const versions = ambiguous ? [1, 2] : [1];
  vi.mocked(resolveExecutionHandoff).mockReturnValue({
    entry: {
      issuances: versions.map((version) => ({
        scope: { id: `scope-${version}`, version },
        approval: { id: "approval", systemPolicyVersion: version },
      })),
      systems: versions.map((version) => ({
        version,
        configuration: {
          availableSpecialists: [
            version === 1
              ? specialist
              : { ...specialist, role: "Different role" },
          ],
        },
      })),
    },
    analysisSources: versions.map((version) => ({
      scope: { id: `scope-${version}`, version },
      assignment: {
        specialistId: specialist.id,
        assignmentId: "approved",
        objective: "Review",
      },
    })),
    context: { goal: {} },
    delegation: { grant },
    policy,
  } as ReturnType<typeof resolveExecutionHandoff>);
  return () =>
    prepareAssignmentContext(
      {} as Parameters<typeof prepareAssignmentContext>[0],
      {} as Parameters<typeof prepareAssignmentContext>[1]
    );
}

it("offers only the intersection of approved policy and delegation scopes", () => {
  expect(setup()().repositoryAccessCeilings).toEqual(["read", "write"]);
  expect(setup({ disjoint: true })().repositoryAccessCeilings).toEqual([]);
  expect(setup({ workerMode: false })().repositoryAccessCeilings).toEqual([
    "read",
  ]);
});

it("rejects different approved definitions for the same Specialist ID", () => {
  expect(setup({ ambiguous: true })).toThrow(
    "Approved Specialist identity is ambiguous."
  );
});

it("projects the approved identity without changing the original staffing binding", () => {
  const { sources, staffingBinding } = setup()();
  const { authority, ...identity } = specialist;
  const historicalSource = {
    scopeId: "scope-1",
    scopeVersion: 1,
    approvalRecordId: "approval",
    assignmentId: "approved",
    assignmentObjective: "Review",
    definition: specialist,
  };
  expect(authority.repositoryAccess).toBe("read");
  expect(sources).toEqual([{ ...historicalSource, definition: identity }]);
  expect(staffingBinding).toBe(governanceDigest([historicalSource]));
});
