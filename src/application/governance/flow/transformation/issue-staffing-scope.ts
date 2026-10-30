import { randomUUID } from "node:crypto";
import type { StaffingProposal } from "@/application/staffing/index.js";
import { governanceDigest } from "@/services/governance-records/index.js";
import {
  approvalRecordSchema,
  type ApprovalRecord,
} from "../../model/approval.js";
import { approvedOperatingScopeSchema } from "../../model/authority.js";

export function issueStaffingScope(
  proposal: StaffingProposal,
  systemVersion: number,
  source: ApprovalRecord["source"]
) {
  const approval = approvalRecordSchema.parse({
    id: `approval-${randomUUID()}`,
    proposalId: proposal.id,
    proposalDigest: governanceDigest(proposal),
    approvedAt: new Date().toISOString(),
    systemPolicyVersion: systemVersion,
    source,
  });
  const scope = approvedOperatingScopeSchema.parse({
    id: `scope-${randomUUID()}`,
    version: 1,
    proposalId: proposal.id,
    approvalRecordId: approval.id,
    policyVersion: `system:${systemVersion}`,
    goal: proposal.goal,
    snapshot: proposal.snapshot,
    assignments: proposal.assignments.map(
      ({ assignmentId, specialistId, objective, contextPaths }) => ({
        assignmentId,
        specialistId,
        objective,
        contextPaths,
      })
    ),
    budget: proposal.budget,
  });
  return { proposal, approval, scope };
}
