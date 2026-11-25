import { validateDependencies } from "./validate-dependencies.js";
import { z } from "zod";

const text = z.string().trim().min(1);

export const phaseBAssignmentSchema = z
  .object({
    id: text,
    workItemId: text,
    specialistId: text,
    repositoryAccessCeiling: z.enum(["read", "write"]),
    objective: text,
    deliverable: text,
    dependsOn: z.array(text).refine((ids) => new Set(ids).size === ids.length),
  })
  .strict();

export const phaseBAssignmentsSchema = z.array(phaseBAssignmentSchema).min(1);
export type PhaseBAssignment = z.infer<typeof phaseBAssignmentSchema>;

type AssignmentWorkItem = {
  id: string;
};

export function selectAssignmentWorkItems<T extends AssignmentWorkItem>(
  workItems: readonly T[],
  selectedIds: readonly string[]
): T[] | undefined {
  const selected = new Set(selectedIds);
  const items = workItems.filter(({ id }) => selected.has(id));
  if (
    !items.length ||
    selected.size !== selectedIds.length ||
    items.length !== selected.size
  )
    return undefined;
  return items;
}

export function validateAssignmentProposal(
  assignments: readonly PhaseBAssignment[],
  workItems: readonly AssignmentWorkItem[],
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
