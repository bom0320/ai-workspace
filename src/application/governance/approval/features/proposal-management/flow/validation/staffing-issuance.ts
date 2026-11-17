import type { InspectedFile } from "@/contracts/repository/inspected-file.js";
import { governanceDigest } from "@/services/governance-records/index.js";
import type {
  GovernanceLedger,
  RepositoryGovernance,
} from "../../../../../model/ledger.js";
import {
  evaluateDelegationCoverage,
  validateCurrentStaffingPolicy,
} from "./evaluate-staffing-approval.js";

type StaffingIssuance = RepositoryGovernance["issuances"][number];

export function assertProposalNotIssued(
  entry: RepositoryGovernance,
  proposalId: string
): void {
  if (entry.issuances.some(({ proposal }) => proposal.id === proposalId))
    throw new Error("Proposal has already been issued.");
}

export function assertIssuanceIdsUnused(
  ledger: GovernanceLedger,
  issuance: StaffingIssuance
): void {
  if (
    Object.values(ledger.repositories).some((repository) =>
      repository.issuances.some(
        (existing) =>
          existing.scope.id === issuance.scope.id ||
          existing.approval.id === issuance.approval.id
      )
    )
  )
    throw new Error("Approval or Scope ID collision.");
}

function assertApprovalBinding(
  { proposal, approval, scope }: StaffingIssuance,
  entry: RepositoryGovernance
): void {
  const system = entry.systems.find(
    ({ version }) => version === approval.systemPolicyVersion
  );
  if (!system) throw new Error("Issuance System Policy record is unavailable.");
  if (
    scope.version !== 1 ||
    scope.proposalId !== proposal.id ||
    approval.proposalId !== proposal.id ||
    scope.approvalRecordId !== approval.id ||
    scope.policyVersion !== `system:${system.version}` ||
    governanceDigest(proposal) !== approval.proposalDigest
  )
    throw new Error(
      "Proposal, ApprovalRecord and Scope bindings do not match."
    );
}

function assertScopeContents({ proposal, scope }: StaffingIssuance): void {
  const scoped = {
    goal: scope.goal,
    snapshot: scope.snapshot,
    budget: scope.budget,
    assignments: scope.assignments,
  };
  const proposed = {
    goal: proposal.goal,
    snapshot: proposal.snapshot,
    budget: proposal.budget,
    assignments: proposal.assignments.map(
      ({ assignmentId, specialistId, objective, contextPaths }) => ({
        assignmentId,
        specialistId,
        objective,
        contextPaths,
      })
    ),
  };
  if (governanceDigest(scoped) !== governanceDigest(proposed))
    throw new Error("Scope contents differ from the approved Proposal.");
}

function assertDelegatedApprovalSource(
  issuance: StaffingIssuance,
  entry: RepositoryGovernance
): void {
  const source = issuance.approval.source;
  if (source.type !== "human-delegation") return;
  const policy = entry.delegations.find(
    ({ id, version }) =>
      id === source.delegationPolicyId &&
      version === source.delegationPolicyVersion
  );
  if (
    !policy ||
    policy !== entry.delegations.at(-1) ||
    policy.status !== "active" ||
    Date.parse(policy.expiresAt) <= Date.now() ||
    policy.approval.id !== source.delegationApprovalId
  )
    throw new Error("Delegated approval source is no longer valid.");
}

// Record integrity uses the original signed policy/delegation records. It must
// remain readable after expiration, policy updates or Repository changes.
export function validateStoredIssuanceRecord(
  issuance: StaffingIssuance,
  entry: RepositoryGovernance
): void {
  assertApprovalBinding(issuance, entry);
  assertScopeContents(issuance);
  const { approval } = issuance;
  if (approval.source.type === "direct-human") {
    if (
      approval.source.confirmation.uid !== process.getuid?.() ||
      Date.parse(approval.source.confirmation.confirmedAt) >
        Date.parse(approval.approvedAt)
    )
      throw new Error("Direct Human confirmation does not match the issuance.");
    return;
  }
  const source = approval.source;
  const delegation = entry.delegations.find(
    (record) =>
      record.id === source.delegationPolicyId &&
      record.version === source.delegationPolicyVersion
  );
  if (
    !delegation ||
    delegation.approval.id !== source.delegationApprovalId ||
    Date.parse(delegation.approval.confirmedAt) >
      Date.parse(approval.approvedAt) ||
    Date.parse(delegation.expiresAt) <= Date.parse(approval.approvedAt)
  )
    throw new Error("Delegated approval does not match its historical source.");
}

// Current eligibility remains mandatory for Scope lookup, Authorization and
// approval mutation. A readable historical record grants no execution authority.
export function validateStoredIssuance(
  issuance: StaffingIssuance,
  entry: RepositoryGovernance
): InspectedFile[] {
  if (entry.systems.at(-1)?.version !== issuance.approval.systemPolicyVersion)
    throw new Error("Issuance is not bound to the current System Policy.");
  validateStoredIssuanceRecord(issuance, entry);
  assertDelegatedApprovalSource(issuance, entry);
  const files = validateCurrentStaffingPolicy(issuance.proposal, entry);
  if (
    issuance.approval.source.type === "human-delegation" &&
    evaluateDelegationCoverage(issuance.proposal, entry, Date.now()) !==
      "delegated"
  )
    throw new Error("Current evaluation no longer permits delegated approval.");
  return files;
}
