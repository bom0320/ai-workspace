import type {
  BuildRefinementProposalInput,
  NormalizeRefinementChangesInput,
} from "../data-flow/refinement/input.js";
import type { AssignmentChange } from "../data-flow/refinement/output.js";
import { listRepositoryFilesAtCommit } from "@/infrastructure/git/index.js";
import { governanceDigest } from "@/services/governance-records/index.js";
import { isContextScopeContained } from "@/services/repository-inspection/index.js";
import {
  buildStaffingProposal,
  staffingDraftSchema,
  type StaffingProposal,
} from "@/application/staffing/index.js";

export function normalizeRefinementChanges(
  ...[result, current, snapshot, policy]: NormalizeRefinementChangesInput
): AssignmentChange[] {
  const bySpecialist = new Map(
    current.map((assignment) => [assignment.specialistId, assignment])
  );
  const changed = new Map<string, AssignmentChange>();
  const operations = new Set<string>();
  const files = result.changes.some((change) => "context" in change)
    ? listRepositoryFilesAtCommit(snapshot.repositoryRoot, snapshot.commitSha)
    : [];

  for (const change of result.changes) {
    const key = governanceDigest([change.kind, change.specialistId]);
    const prior = bySpecialist.get(change.specialistId);
    if (
      operations.has(key) ||
      !policy.availableSpecialists.some(
        ({ id }) => id === change.specialistId
      ) ||
      (change.kind === "specialist-addition") !== !prior
    )
      throw new Error("Unknown or duplicate Specialist change.");
    operations.add(key);
    const draft = changed.get(change.specialistId) ?? {
      specialistId: change.specialistId,
      objective: prior?.objective ?? "",
      contextPaths: [...(prior?.contextPaths ?? [])],
      rationale: change.reason,
    };
    if ("objective" in change && change.objective)
      draft.objective = change.objective;
    if ("context" in change) {
      for (const scope of change.context) {
        if (!isContextScopeContained(scope, policy.contextAccessPolicy))
          throw new Error("Context request exceeds System Policy.");
        const paths = files
          .filter(
            ({ path, mode, size }) =>
              (mode === "100644" || mode === "100755") &&
              size !== null &&
              size <= policy.limits.maxFileBytes &&
              (scope.kind === "file"
                ? path === scope.path
                : path.startsWith(`${scope.path}/`))
          )
          .map(({ path }) => path);
        if (!paths.length)
          throw new Error("Context scope contains no permitted regular file.");
        draft.contextPaths = [...new Set([...draft.contextPaths, ...paths])];
      }
    }
    changed.set(change.specialistId, draft);
  }
  return [...changed.values()];
}

export function buildRefinementProposal(
  ...[assignments, reason, intent, goal, snapshot]: BuildRefinementProposalInput
): StaffingProposal {
  const draft = staffingDraftSchema.parse({
    intent: intent,
    assignments,
    rationale: reason,
    budget: { maxAgentInvocations: assignments.length },
  });
  return buildStaffingProposal(draft, goal, snapshot);
}
