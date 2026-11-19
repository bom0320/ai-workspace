import { governanceDigest } from "@/services/governance-records/index.js";
import type { RepositoryGovernance } from "../../../../model/ledger.js";

export function hasValidExecutionReservations(
  entry: RepositoryGovernance,
  repositoryKey: string,
  ids: Set<string>
): boolean {
  const decompositions = new Map(
    (entry.executionDecompositions ?? []).map((value) => [value.binding, value])
  );
  const sources = new Map(
    (entry.workItemExecutionSources ?? []).map((value) => [value.id, value])
  );
  if (
    decompositions.size !== (entry.executionDecompositions?.length ?? 0) ||
    sources.size !== (entry.workItemExecutionSources?.length ?? 0)
  )
    return false;

  for (const { binding, ...subject } of decompositions.values()) {
    const decisions = entry.approvedDecisions?.filter(
      ({ id }) => id === subject.approvedDecisionId
    );
    if (
      decisions?.length !== 1 ||
      governanceDigest(decisions[0]) !== subject.approvalBinding ||
      governanceDigest(subject) !== binding ||
      new Set(subject.workItems.map(({ id }) => id)).size !==
        subject.workItems.length
    )
      return false;
  }
  for (const { id, ...subject } of sources.values()) {
    if (
      governanceDigest(subject) !== id ||
      governanceDigest(subject.snapshot.repositoryRoot) !== repositoryKey ||
      !decompositions
        .get(subject.decompositionBinding)
        ?.workItems.some(({ id }) => id === subject.workItemId)
    )
      return false;
  }

  const used = new Map<string, number>();
  const reservedWork = new Set<string>();
  for (const reservation of entry.executionReservations ?? []) {
    const source = sources.get(reservation.sourceId);
    const decisionId =
      source &&
      decompositions.get(source.decompositionBinding)?.approvedDecisionId;
    const delegation = entry.executionDelegations?.find(
      ({ id }) => id === reservation.delegationId
    );
    if (!delegation || !source || delegation.approvedDecisionId !== decisionId)
      return false;

    const work = governanceDigest([
      source.decompositionBinding,
      source.workItemId,
    ]);
    const count = (used.get(delegation.id) ?? 0) + 1;
    const reservedAt = Date.parse(reservation.reservedAt);
    const expiresAt = Date.parse(delegation.grant.expiresAt);
    if (
      ids.has(reservation.id) ||
      reservedWork.has(work) ||
      count > delegation.grant.budget.maxExecutions ||
      reservedAt < Date.parse(delegation.issuedAt) ||
      reservedAt >= expiresAt ||
      (reservation.claimedAt &&
        (Date.parse(reservation.claimedAt) < reservedAt ||
          Date.parse(reservation.claimedAt) >= expiresAt))
    )
      return false;
    ids.add(reservation.id);
    reservedWork.add(work);
    used.set(delegation.id, count);
  }
  return true;
}
