import type { resolveExecutionContext } from "../context/resolve-execution-context.js";

export function assertExecutionReservationAvailable(
  evaluated: NonNullable<ReturnType<typeof resolveExecutionContext>>
) {
  const { entry, source, maxExecutions } = evaluated;
  const reservations = entry.executionReservations ?? [];
  const matchingSourceIds = new Set(
    entry.workItemExecutionSources
      ?.filter(
        (record) =>
          record.decompositionBinding === source.decompositionBinding &&
          record.workItemId === source.workItemId
      )
      .map(({ id }) => id)
  );
  if (
    [...reservations, ...(entry.assignmentExecutions ?? [])].filter(
      ({ delegationId }) => delegationId === evaluated.execution.delegationId
    ).length >= maxExecutions ||
    reservations.some(({ sourceId }) => matchingSourceIds.has(sourceId)) ||
    entry.assignmentExecutions?.some(({ request }) =>
      entry.assignmentPlans?.some(
        (plan) =>
          plan.id === request.planId &&
          plan.decompositionBinding === source.decompositionBinding &&
          plan.assignments.some(
            ({ id, workItemId }) =>
              id === request.assignmentId && workItemId === source.workItemId
          )
      )
    )
  )
    throw new Error(
      "Execution budget exhausted or Work Item already reserved."
    );
}
