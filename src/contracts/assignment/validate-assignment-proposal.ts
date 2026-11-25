import { validateDependencies } from "../shared/validate-dependencies.js";
import type { PhaseBAssignment } from "./phase-b-assignment.js";

export function validateAssignmentProposal(
  assignments: readonly PhaseBAssignment[],
  workItems: readonly { id: string }[],
  bounds?: {
    specialistIds: readonly string[];
    repositoryAccessCeilings: readonly PhaseBAssignment["repositoryAccessCeiling"][];
  }
): string | undefined {
  const dependencyError = validateDependencies(assignments, "Assignment");
  if (dependencyError) return dependencyError;

  const byId = new Map(
    assignments.map((assignment) => [assignment.id, assignment])
  );
  const selectedIds = new Set(workItems.map(({ id }) => id));
  const covered = new Set<string>();
  for (const {
    workItemId,
    specialistId,
    repositoryAccessCeiling,
    dependsOn,
  } of assignments) {
    if (!selectedIds.has(workItemId))
      return "Assignment Work Item is outside the selected scope.";
    if (
      bounds &&
      (!bounds.specialistIds.includes(specialistId) ||
        !bounds.repositoryAccessCeilings.includes(repositoryAccessCeiling))
    )
      return "Assignment Specialist or access ceiling is outside preparation bounds.";
    if (new Set(dependsOn).size !== dependsOn.length)
      return "Duplicate Assignment dependency.";
    if (dependsOn.some((id) => byId.get(id)?.workItemId !== workItemId))
      return "Assignment dependencies must belong to the same Work Item.";
    covered.add(workItemId);
  }
  if (workItems.some(({ id }) => !covered.has(id)))
    return "Every selected Work Item requires an Assignment.";
}
