import { executeCollaborativeAssignment } from "@/application/execution/index.js";
import {
  getPreparedAssignmentPlan,
  getAssignmentExecutionResults,
} from "@/application/governance/index.js";
import type { PhaseBHandoff } from "../../../../contracts/phase-handoff.js";

export type CollaborativeExecutionOptions = {
  maxConcurrentRuns?: number;
  contexts: Record<string, { readPaths: string[]; timeoutMs: number }>;
};

export async function executeAssignmentPlan(
  handoff: PhaseBHandoff,
  planId: string,
  selectedWorkItemIds: readonly string[],
  { contexts, maxConcurrentRuns = 1 }: CollaborativeExecutionOptions,
  detailedPlanning?: {
    workItemIds: readonly string[];
    run: (id: string) => Promise<boolean>;
  }
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
      plan.assignments.some(({ workItemId }) => !selected.has(workItemId))
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
  const completed = new Set(
    recorded
      .filter(({ status }) => status === "completed")
      .map(({ assignmentId }) => assignmentId)
  );
  const terminal = new Set(recorded.map(({ assignmentId }) => assignmentId));
  let pending = plan.assignments.filter(({ id }) => !terminal.has(id));
  const waiting = new Set<string>();
  type Completion =
    | { kind: "planning"; workItemId: string; passed: boolean }
    | {
        kind: "execution";
        assignmentId: string;
        workItemId: string;
        result: Awaited<ReturnType<typeof executeCollaborativeAssignment>>;
      };
  const running = new Map<string, Promise<Completion>>();
  const planningQueue = [...(detailedPlanning?.workItemIds ?? [])];
  const planningFailures = new Set<string>();
  const executionKey = (id: string) => `execution:${id}`;
  const selectedWorkItems = selectedWorkItemIds.map((id) =>
    workItems.find((item) => item.id === id)!
  );
  const assignmentsByWorkItem = new Map(
    selectedWorkItems.map(({ id }) => [
      id,
      plan.assignments.filter((assignment) => assignment.workItemId === id),
    ])
  );
  const completedWorkItems = new Set<string>();
  function refreshCompletedWorkItems() {
    for (const { id, workType } of selectedWorkItems) {
      const assignments = assignmentsByWorkItem.get(id)!;
      if (
        workType === "read-only" &&
        assignments.length &&
        assignments.every((assignment) => completed.has(assignment.id))
      )
        completedWorkItems.add(id);
    }
  }
  refreshCompletedWorkItems();
  for (;;) {
    while (running.size < maxConcurrentRuns) {
      const next = selectedWorkItems
        .filter(({ dependsOn }) =>
          dependsOn.every((id) => completedWorkItems.has(id))
        )
        .map(({ id: workItemId }) =>
          pending.find(
            (assignment) =>
              assignment.workItemId === workItemId &&
              assignment.executor.kind === "specialist" &&
              !running.has(executionKey(assignment.id)) &&
              !waiting.has(assignment.id) &&
              assignment.dependsOn.every((id) => completed.has(id))
          )
        )
        .find((assignment) => assignment !== undefined);
      if (!next) {
        const workItemId = planningQueue.shift();
        if (!detailedPlanning || workItemId === undefined) break;
        running.set(
          `planning:${workItemId}`,
          detailedPlanning.run(workItemId).then(
            (passed) => ({ kind: "planning", workItemId, passed }),
            () => ({ kind: "planning", workItemId, passed: false })
          )
        );
        continue;
      }
      const context = Object.hasOwn(contexts, next.id)
        ? contexts[next.id]
        : undefined;
      if (!context) {
        waiting.add(next.id);
        continue;
      }
      running.set(
        executionKey(next.id),
        executeCollaborativeAssignment(handoff, {
          planId,
          assignmentId: next.id,
          readPaths: context.readPaths,
          timeoutMs: context.timeoutMs,
        }).then((result) => ({
          kind: "execution",
          assignmentId: next.id,
          workItemId: next.workItemId,
          result,
        }))
      );
    }

    if (!running.size) break;
    const finished = await Promise.race(running.values());
    if (finished.kind === "planning") {
      running.delete(`planning:${finished.workItemId}`);
      if (!finished.passed) planningFailures.add(finished.workItemId);
      continue;
    }
    const { assignmentId, workItemId, result } = finished;
    running.delete(executionKey(assignmentId));
    if (result.status === "denied" && result.failure === "dependency") {
      waiting.add(assignmentId);
      continue;
    }
    results.push({ assignmentId, workItemId, ...result });
    pending = pending.filter(({ id }) => id !== assignmentId);
    if (result.status === "completed") {
      completed.add(assignmentId);
      refreshCompletedWorkItems();
    }
  }
  const workItemResults = selectedWorkItems.map(({ id }) => {
    const assignmentResults = results.filter(
      ({ workItemId }) => workItemId === id
    );
    return {
      workItemId: id,
      status: planningFailures.has(id)
        ? ("failed" as const)
        : aggregateStatus(assignmentResults, !completedWorkItems.has(id)),
    };
  });
  return {
    status: aggregateStatus(workItemResults, false),
    planId,
    results,
    workItemResults,
    ...(planningFailures.size && {
      failedPlanningWorkItemIds: [...planningFailures],
    }),
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

type ExecutionStatus = "completed" | "denied" | "failed" | "pending";

function aggregateStatus(
  results: readonly { status: ExecutionStatus }[],
  pending: boolean
): ExecutionStatus {
  if (results.some(({ status }) => status === "failed")) return "failed";
  if (results.some(({ status }) => status === "denied")) return "denied";
  return pending || results.some(({ status }) => status === "pending")
    ? "pending"
    : "completed";
}
