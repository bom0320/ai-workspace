import { randomUUID } from "node:crypto";

import type { StaffingContextState } from "../../model/state.js";
import { staffingProposalSchema } from "../../model/staffing.js";
import type { StaffingDraft } from "../../protocol/ceo.js";
import { ProposalPolicyError } from "../validation/validate-proposal.js";

// Called only after policy/file checks; constructs a proposal, not authority.
export function buildStaffingProposal(
  draft: StaffingDraft,
  state: StaffingContextState
) {
  // IDs are generated only after policy/file validation. No approval, Scope,
  // budget reservation or invocation is constructed by finalization.
  const assignments = draft.assignments.map((assignment) => ({
    ...assignment,
    assignmentId: `assignment-${randomUUID()}`,
  }));
  if (
    new Set(assignments.map(({ assignmentId }) => assignmentId)).size !==
    assignments.length
  )
    throw new ProposalPolicyError("Harness assignment ID collision.");
  const proposal = staffingProposalSchema.parse({
    ...draft,
    id: `proposal-${randomUUID()}`,
    assignments,
    goal: state.context.goal,
    snapshot: state.snapshot,
  });
  return proposal;
}
