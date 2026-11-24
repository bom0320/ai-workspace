import { executeCollaborativeAssignment } from "@/application/execution/index.js";
import {
  getPreparedAssignmentPlan,
  getAssignmentExecutionResults,
} from "@/application/governance/index.js";
import type { PhaseBHandoff } from "../../../../contracts/phase-handoff.js";

export type CollaborativeExecutionOptions = {
  contexts: Record<string, { readPaths: string[]; timeoutMs: number }>;
};

export async function executeAssignmentPlan(
  handoff: PhaseBHandoff,
  planId: string,
  { contexts }: CollaborativeExecutionOptions
) {
  let plan: ReturnType<typeof getPreparedAssignmentPlan>["plan"];
  let recorded: ReturnType<typeof getAssignmentExecutionResults>;
  try {
    ({ plan } = getPreparedAssignmentPlan(handoff, planId));
    recorded = getAssignmentExecutionResults(handoff, planId);
  } catch {
    return { status: "denied" as const, failure: "plan" as const, planId };
  }

  const results: (Awaited<ReturnType<typeof executeCollaborativeAssignment>> & {
    assignmentId: string;
    workItemId: string;
  })[] = [...recorded];
  const completed = new Set(
    recorded
      .filter(({ status }) => status === "completed")
      .map(({ assignmentId }) => assignmentId)
  );
  const terminal = new Set(recorded.map(({ assignmentId }) => assignmentId));
  let pending = plan.assignments.filter(({ id }) => !terminal.has(id));
  const waiting = new Set<string>();
  for (;;) {
    const next = pending.find(
      ({ id, executor, dependsOn }) =>
        executor.kind === "specialist" &&
        !waiting.has(id) &&
        dependsOn.every((dependency) => completed.has(dependency))
    );
    if (!next) break;
    const context = Object.hasOwn(contexts, next.id)
      ? contexts[next.id]
      : undefined;
    if (!context) {
      waiting.add(next.id);
      continue;
    }
    const result = await executeCollaborativeAssignment(handoff, {
      planId,
      assignmentId: next.id,
      readPaths: context.readPaths,
      timeoutMs: context.timeoutMs,
    });
    if (result.status === "denied" && result.failure === "dependency") {
      waiting.add(next.id);
      continue;
    }
    results.push({
      assignmentId: next.id,
      workItemId: next.workItemId,
      ...result,
    });
    pending = pending.filter(({ id }) => id !== next.id);
    if (result.status === "completed") completed.add(next.id);
  }
  return {
    status: results.some(({ status }) => status === "failed")
      ? ("failed" as const)
      : results.some(({ status }) => status === "denied")
        ? ("denied" as const)
        : pending.length
          ? ("pending" as const)
          : ("completed" as const),
    planId,
    results,
    pendingAssignments: pending.map(({ id, workItemId, executor }) => ({
      assignmentId: id,
      workItemId,
      reason:
        executor.kind === "worker"
          ? ("worker-pending" as const)
          : Object.hasOwn(contexts, id)
            ? ("dependency-pending" as const)
            : ("context-required" as const),
    })),
  };
}
