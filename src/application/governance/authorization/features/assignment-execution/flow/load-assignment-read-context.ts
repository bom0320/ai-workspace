import {
  loadSnapshotFiles,
  type CollaborativeSpecialistContext,
} from "@/application/decision/index.js";
import type { PathScope } from "@/contracts/repository/context-access-policy.js";
import { listRepositoryFilesAtCommit } from "@/infrastructure/git/index.js";
import {
  isContextPathAllowed,
  isInspectablePath,
} from "@/services/repository-inspection/index.js";
import { assertRepositoryMatchesSnapshot } from "@/services/repository-snapshot/index.js";
import { AssignmentExecutionError } from "../../../../model/assignment-execution.js";
import type { resolveAssignmentExecution } from "./resolve-assignment-execution.js";

const maxFiles = 32;
const maxFileBytes = 16 * 1024;
const maxContextBytes = 64 * 1024;

export function loadAssignmentReadContext(
  {
    snapshot,
    context: { goal },
    synthesisProposal,
    workItem,
    assignment,
  }: ReturnType<typeof resolveAssignmentExecution>,
  scopes: PathScope[],
  remainingTime: () => number
): CollaborativeSpecialistContext {
  if (scopes.some(({ path }) => !isInspectablePath(path)))
    throw new AssignmentExecutionError("authority");
  const entries = listRepositoryFilesAtCommit(
    snapshot.repositoryRoot,
    snapshot.commitSha,
    { timeoutMs: remainingTime(), ignoreReplaceObjects: true }
  ).filter(({ path }) => isContextPathAllowed(path, { allowedScopes: scopes }));
  remainingTime();
  const files = entries.filter(
    ({ path, mode, size }) =>
      isInspectablePath(path) &&
      (mode === "100644" || mode === "100755") &&
      size !== null
  );
  if (
    scopes.some(
      (scope) =>
        !files.some(({ path }) =>
          isContextPathAllowed(path, { allowedScopes: [scope] })
        )
    )
  )
    throw new AssignmentExecutionError("authority");
  if (
    files.length > maxFiles ||
    files.some(({ size }) => size === null || size > maxFileBytes) ||
    files.reduce((total, { size }) => total + (size ?? 0), 0) > maxContextBytes
  )
    throw new AssignmentExecutionError("validation");

  const context: CollaborativeSpecialistContext = {
    goal,
    approvedDirection: synthesisProposal.direction.text,
    workItem: {
      id: workItem.id,
      objective: workItem.objective,
      deliverable: workItem.deliverable,
    },
    assignmentObjective: assignment.objective,
    assignmentDeliverable: assignment.deliverable,
    repositoryCommitSha: snapshot.commitSha,
    predecessorResults: [],
    repositoryFiles: files.map(({ path, size }) => ({ path, size: size ?? 0 })),
    files: files.flatMap(({ path }) => {
      const timeoutMs = remainingTime();
      try {
        return loadSnapshotFiles(snapshot, [path], {
          timeoutMs,
          ignoreReplaceObjects: true,
        });
      } catch {
        throw new AssignmentExecutionError("validation");
      }
    }),
  };
  if (Buffer.byteLength(JSON.stringify(context), "utf8") > maxContextBytes)
    throw new AssignmentExecutionError("validation");
  assertRepositoryMatchesSnapshot(snapshot);
  remainingTime();
  return context;
}
