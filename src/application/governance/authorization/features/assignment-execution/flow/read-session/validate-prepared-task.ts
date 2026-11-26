import { implementationPlanMatchesPaths } from "@/contracts/specialist/implementation-plan.js";
import { taskContractSchema } from "@/contracts/specialist/task-contract.js";
import type { RepositorySnapshot } from "@/contracts/repository/snapshot.js";
import { listRepositoryFilesAtCommit } from "@/infrastructure/git/index.js";
import type { CollaborativeSpecialistContext } from "@/application/specialist/analysis/index.js";
import { validateTaskExecutionContract } from "../../../../validate-task-execution-contract.js";
import { AssignmentExecutionError } from "../../../../../model/assignment-execution.js";
import type { checkWriteEligibility } from "./check-write-eligibility.js";

export function validatePreparedTask(
  input: unknown,
  bounds: ReturnType<typeof checkWriteEligibility>,
  inspectedContext: CollaborativeSpecialistContext,
  snapshot: RepositorySnapshot,
  remainingTime: () => number
) {
  const task = taskContractSchema.strict().parse(input);
  try {
    validateTaskExecutionContract(task, bounds);
    const { goal } = inspectedContext;
    const conflicts = task.allowedPaths.some((path) =>
      task.forbiddenPaths.some(
        (forbidden) =>
          path.startsWith(forbidden + "/") || forbidden.startsWith(path + "/")
      )
    );
    if (
      conflicts ||
      !task.implementationPlan ||
      task.implementationSteps !== undefined ||
      !implementationPlanMatchesPaths(
        task.implementationPlan,
        task.allowedPaths
      ) ||
      task.targetRepository !== goal.targetRepository ||
      !task.objective.trim() ||
      !task.acceptanceCriteria.length ||
      task.acceptanceCriteria.some((criterion) => !criterion.trim()) ||
      !(goal.constraints ?? []).every((constraint) =>
        task.constraints.includes(constraint)
      )
    )
      throw new Error("Invalid prepared task.");

    // Check existence against the full approved tree internally. Only Read Session
    // blobs can provide content, and unapproved paths are never sent to the Planner.
    const tree = listRepositoryFilesAtCommit(
      snapshot.repositoryRoot,
      snapshot.commitSha,
      {
        timeoutMs: remainingTime(),
        ignoreReplaceObjects: true,
      }
    );
    const supplied = new Set(inspectedContext.files.map(({ path }) => path));
    const existing = new Map(tree.map(({ path, mode }) => [path, mode]));
    for (const path of task.allowedPaths) {
      const mode = existing.get(path);
      if (mode !== undefined) {
        if ((mode !== "100644" && mode !== "100755") || !supplied.has(path))
          throw new Error(
            "Existing target was not supplied as a regular Snapshot file."
          );
        continue;
      }
      if (
        tree.some(
          ({ path: entry }) =>
            entry.startsWith(path + "/") || path.startsWith(entry + "/")
        )
      )
        throw new Error("New target collides with an existing Snapshot path.");
    }
  } catch (error) {
    if (error instanceof AssignmentExecutionError) throw error;
    throw new AssignmentExecutionError("validation");
  }
  return task;
}
