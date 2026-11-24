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
  workType?: "read-only" | "repository-modification";
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
    items.length !== selected.size ||
    items.some(({ workType }) => !workType)
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
  const workTypes = new Map(
    workItems.map(({ id, workType }) => [id, workType])
  );
  const covered = new Set<string>();
  const writable = new Set<string>();
  for (const {
    workItemId,
    specialistId,
    repositoryAccessCeiling,
    dependsOn,
  } of assignments) {
    const workType = workTypes.get(workItemId);
    if (
      workType !== "repository-modification" &&
      !(workType === "read-only" && repositoryAccessCeiling === "read")
    )
      return "Assignment or Work Item is outside preparation bounds.";
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
    if (repositoryAccessCeiling === "write") writable.add(workItemId);
  }
  if (workItems.some(({ id }) => !covered.has(id)))
    return "Every selected Work Item requires an Assignment.";
  if (
    workItems.some(
      ({ id, workType }) =>
        workType === "repository-modification" && !writable.has(id)
    )
  )
    return "Every Repository modification Work Item requires a write Assignment.";
}
