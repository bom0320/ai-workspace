import {
  consumeValidatedDecision,
  type AgentDecision,
} from "@/application/decision/index.js";
import {
  consumeValidatedComparison,
  type ComparisonResult,
} from "@/application/comparison/index.js";
import { governanceDigest } from "@/services/governance-records/index.js";
import type { AuthorizedSpecialistInvocation } from "../../../../model/authority.js";
import { withGovernanceLedger } from "../../../../records/governance-transaction.js";
import { currentScopeSource, sameContent } from "../shared/resolve-context.js";

// Called before a validated object crosses a Graph serialization boundary.
// Neither a stored Claim nor a structurally valid AgentDecision alone proves execution.
export function recordDirectionDecision(
  invocation: AuthorizedSpecialistInvocation,
  decision: AgentDecision
): void {
  const proof = consumeValidatedDecision(decision);
  withGovernanceLedger((ledger, save) => {
    const {
      entry,
      issuance: { scope },
    } = currentScopeSource(ledger, invocation.scopeId);
    const reservation = entry.reservations?.find(
      (value) => value.invocationId === invocation.invocationId
    );
    if (
      !reservation?.claimedAt ||
      reservation.invocationDigest !== governanceDigest(invocation) ||
      !sameContent(proof.snapshot, invocation.snapshot) ||
      !sameContent(proof.context, {
        goal: invocation.goal,
        assignmentObjective: invocation.assignmentObjective,
        repositoryCommitSha: invocation.snapshot.commitSha,
        files: invocation.files,
      }) ||
      proof.decision.specialistId !== invocation.specialist.id ||
      scope.version !== invocation.scopeVersion
    )
      throw new Error(
        "Decision provenance does not match the claimed Invocation."
      );
    const analyses = (entry.directionAnalyses ??= []);
    let analysis = analyses.find(
      (value) =>
        value.scopeId === scope.id && value.scopeVersion === scope.version
    );
    if (!analysis) {
      analysis = {
        scopeId: scope.id,
        scopeVersion: scope.version,
        decisions: [],
      };
      analyses.push(analysis);
    }
    if (
      analysis.decisions.some(
        (value) =>
          value.assignmentId === invocation.assignmentId ||
          value.invocationId === invocation.invocationId
      )
    )
      throw new Error("Direction Assignment has already been recorded.");
    analysis.decisions.push({
      invocationId: invocation.invocationId,
      assignmentId: invocation.assignmentId,
      decision: proof.decision,
    });
    save();
  });
}

export function recordDirectionComparison(
  scopeId: string,
  comparison: ComparisonResult
): void {
  const proof = consumeValidatedComparison(comparison);
  withGovernanceLedger((ledger, save) => {
    const {
      entry,
      issuance: { scope },
    } = currentScopeSource(ledger, scopeId);
    const analysis = entry.directionAnalyses?.find(
      (value) => value.scopeId === scopeId
    );
    if (
      !analysis ||
      analysis.comparison ||
      analysis.decisions.length !== scope.assignments.length
    )
      throw new Error(
        "Comparison source analysis is incomplete or already recorded."
      );
    const decisions = scope.assignments.map(
      (assignment) =>
        analysis.decisions.find(
          (value) => value.assignmentId === assignment.assignmentId
        )?.decision
    );
    if (
      !sameContent(proof.context, {
        goal: scope.goal,
        repositoryCommitSha: scope.snapshot.commitSha,
        decisions,
      })
    )
      throw new Error(
        "Comparison provenance does not match approved analysis."
      );
    analysis.comparison = { status: "completed", comparison: proof.comparison };
    save();
  });
}
