import { validateDependencies } from "./validate-dependencies.js";
import { z } from "zod";

const text = z.string().trim().min(1);

export const phaseBAssignmentSchema = z
  .object({
    id: text,
    workItemId: text,
    executor: z.discriminatedUnion("kind", [
      z.object({ kind: z.literal("specialist"), specialistId: text }).strict(),
      z
        .object({
          kind: z.literal("worker"),
          mode: z.literal("codex-worktree"),
        })
        .strict(),
    ]),
    objective: text,
    deliverable: text,
    dependsOn: z.array(text).refine((ids) => new Set(ids).size === ids.length),
  })
  .strict();

export const phaseBAssignmentsSchema = z.array(phaseBAssignmentSchema).min(1);
export type PhaseBAssignment = z.infer<typeof phaseBAssignmentSchema>;

// Used at each trust boundary with that boundary's Work Items.
export function validateAssignmentProposal(
  assignments: PhaseBAssignment[],
  workItems: readonly {
    id: string;
    workType?: "read-only" | "repository-modification";
  }[]
): string | undefined {
  const dependencyError = validateDependencies(assignments, "Assignment");
  if (dependencyError) return dependencyError;

  const byId = new Map(
    assignments.map((assignment) => [assignment.id, assignment])
  );
  const workTypes = new Map(
    workItems.map(({ id, workType }) => [id, workType])
  );
  for (const { workItemId, executor, dependsOn } of assignments) {
    const workType = workTypes.get(workItemId);
    if (
      workType !== "repository-modification" &&
      !(workType === "read-only" && executor.kind === "specialist")
    )
      return "Assignment executor or Work Item is outside preparation bounds.";
    if (dependsOn.some((id) => byId.get(id)?.workItemId !== workItemId))
      return "Assignment dependencies must belong to the same Work Item.";
  }
}
