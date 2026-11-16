import { getApprovedStaffingScope } from "@/application/governance/index.js";
import { preflightSpecialistDecisions } from "../../validation/preflight-specialist-decisions.js";
import type { PhaseAState } from "../../state.js";

export function preflightSpecialistDecisionsNode(
  state: PhaseAState
): Partial<PhaseAState> {
  // 1. Resolve the Stored Approved Scope
  try {
    if (state.staffingApprovalResult?.status !== "approved")
      throw new Error("Specialist Decisions require approved Staffing.");
    const approvedScope = state.staffingApprovalResult.scope;
    const stored = getApprovedStaffingScope(approvedScope.id);
    if (stored.status !== "approved")
      throw new Error(
        "reason" in stored ? stored.reason : "Approved Scope unavailable."
      );
    const { scope } = stored;
    if (
      scope.id !== approvedScope.id ||
      scope.version !== approvedScope.version
    )
      throw new Error(
        "Stored Scope ID or Version does not match Staffing Approval."
      );

    // 2. Project Every Stored Assignment in Approved Order
    // State's Scope is not authority: use only the freshly validated stored data.
    const requests = scope.assignments.map((assignment) => ({
      scopeId: scope.id,
      scopeVersion: scope.version,
      assignmentId: assignment.assignmentId,
      requestedContextPaths: [...assignment.contextPaths],
    }));
    // 3. Validate and Detach the Entire Batch Before Any Reservation
    const prepared = preflightSpecialistDecisions({
      scopeId: scope.id,
      requests,
    });
    if (prepared.status === "failed")
      return { specialistDecisionsResult: prepared };
    return {
      preparedSpecialistRequests: prepared.requests,
      currentSpecialistIndex: 0,
      collectedDecisions: [],
      specialistComparisonContext: {
        goal: prepared.scope.goal,
        repositoryCommitSha: prepared.scope.snapshot.commitSha,
      },
    };
  } catch (error) {
    return {
      specialistDecisionsResult: {
        status: "failed",
        stage: "preflight",
        reason:
          error instanceof Error
            ? error.message
            : "Approved Scope lookup failed.",
      },
    };
  }
}
