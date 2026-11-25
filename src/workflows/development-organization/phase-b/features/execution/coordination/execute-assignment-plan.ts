import type { AssignmentExecutionRequest } from "@/application/governance/index.js";
import { executeCollaborativeAssignment } from "@/application/execution/index.js";
import {
  getPreparedAssignmentPlan,
  getAssignmentExecutionResults,
} from "@/application/governance/index.js";
import type { PhaseBHandoff } from "../../../../contracts/phase-handoff.js";

export type CollaborativeExecutionOptions = {
  maxConcurrentRuns?: number;
  contexts: Record<
    string,
    Pick<
      Extract<AssignmentExecutionRequest, { access: "read" }>,
      "readScopes" | "timeoutMs"
    >
  >;
};

export async function executeAssignmentPlan(
  handoff: PhaseBHandoff,
  planId: string,
  selectedWorkItemIds: readonly string[],
  { contexts, maxConcurrentRuns = 1 }: CollaborativeExecutionOptions
) {
  if (!Number.isSafeInteger(maxConcurrentRuns) || maxConcurrentRuns < 1)
    throw new RangeError("maxConcurrentRuns must be a positive safe integer.");
  let plan: ReturnType<typeof getPreparedAssignmentPlan>["plan"];
  let workItems: ReturnType<typeof getPreparedAssignmentPlan>["workItems"];
  let recorded: ReturnType<typeof getAssignmentExecutionResults>;
  try {
    ({ plan, workItems } = getPreparedAssignmentPlan(handoff, planId));
    const selected = new Set(selectedWorkItemIds);
    if (
      !selected.size ||
      selected.size !== selectedWorkItemIds.length ||
      selectedWorkItemIds.some(
        (id) => !workItems.some((item) => item.id === id)
      ) ||
      plan.selectedWorkItemIds.length !== selected.size ||
      plan.selectedWorkItemIds.some((id) => !selected.has(id))
    )
      throw new Error("Assignment Plan does not match selected Work Items.");
    recorded = getAssignmentExecutionResults(handoff, planId);
  } catch {
    return { status: "denied" as const, failure: "plan" as const, planId };
  }

  const results: (Awaited<ReturnType<typeof executeCollaborativeAssignment>> & {
    assignmentId: string;
    workItemId: string;
  })[] = [...recorded];
  const terminal = new Set(recorded.map(({ assignmentId }) => assignmentId));
  const pendingAssignments = [];
  const eligible = [];
  for (const workItemId of selectedWorkItemIds) {
    const workItem = workItems.find(({ id }) => id === workItemId)!;
    for (const assignment of plan.assignments.filter(
      (value) => value.workItemId === workItemId && !terminal.has(value.id)
    )) {
      const context = Object.hasOwn(contexts, assignment.id)
        ? contexts[assignment.id]
        : undefined;
      // Read results do not satisfy either kind of dependency.
      if (
        workItem.dependsOn.length ||
        assignment.dependsOn.length ||
        !context
      ) {
        pendingAssignments.push({
          assignmentId: assignment.id,
          workItemId,
          reason:
            workItem.dependsOn.length || assignment.dependsOn.length
              ? ("dependency-pending" as const)
              : ("context-required" as const),
        });
      } else {
        eligible.push({ assignment, context });
      }
    }
  }
  type ReadResult = (typeof results)[number];
  const running = new Map<string, Promise<ReadResult>>();
  let cursor = 0;
  while (cursor < eligible.length || running.size) {
    while (running.size < maxConcurrentRuns && cursor < eligible.length) {
      const {
        assignment: { id: assignmentId, workItemId },
        context,
      } = eligible[cursor++]!;
      running.set(
        assignmentId,
        executeCollaborativeAssignment(handoff, {
          planId,
          assignmentId,
          access: "read",
          readScopes: context.readScopes,
          timeoutMs: context.timeoutMs,
        }).then((result) => ({ assignmentId, workItemId, ...result }))
      );
    }
    const finished = await Promise.race(running.values());
    running.delete(finished.assignmentId);
    results.push(finished);
  }

  const workItemResults = selectedWorkItemIds.map((workItemId) => ({
    workItemId,
    status: aggregateStatus(
      results.filter((result) => result.workItemId === workItemId)
    ),
  }));
  return {
    status: aggregateStatus(workItemResults),
    planId,
    results,
    workItemResults,
    pendingAssignments,
  };
}

function aggregateStatus(results: readonly { status: string }[]) {
  if (results.some(({ status }) => status === "failed")) return "failed";
  if (results.some(({ status }) => status === "denied")) return "denied";
  return "pending";
}
