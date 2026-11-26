import type { GovernanceLedger } from "../../model/ledger.js";
import { governanceDigest } from "@/services/governance-records/index.js";
import {
  phaseBAssignmentsSchema,
  type PhaseBAssignment,
} from "@/contracts/assignment/phase-b-assignment.js";
import { selectAssignmentWorkItems } from "@/contracts/assignment/select-assignment-work-items.js";
import { validateAssignmentProposal } from "@/contracts/assignment/validate-assignment-proposal.js";
import type { AssignmentPlan } from "../../model/assignment-plan.js";
import { withGovernanceLedger } from "../governance-transaction.js";
import {
  prepareAssignmentContext,
  resolveProposalContext,
  type Handoff,
  type Proposal,
} from "./prepare-assignment-context.js";

export class AssignmentRegistrationError extends Error {
  constructor(public readonly failure: "provenance" | "proposal" | "ledger") {
    super("Assignment Plan could not be registered.");
  }
}

function assertAssignments(
  context: ReturnType<typeof resolveProposalContext>,
  assignments: PhaseBAssignment[],
  selectedIds: readonly string[]
) {
  const workItems = selectAssignmentWorkItems(
    context.decomposition.workItems,
    selectedIds
  );
  if (!workItems) throw new Error("Invalid Assignment Plan selection.");
  const reason = validateAssignmentProposal(assignments, workItems, {
    specialistIds: context.sources.map(({ definition }) => definition.id),
    repositoryAccessCeilings: context.repositoryAccessCeilings,
  });
  if (reason) throw new Error(reason);
}

// Internal writer. The proposal is untrusted, even after it has passed the agent boundary.
export function registerAssignmentPlan(
  handoff: Handoff,
  proposal: Proposal,
  input: unknown,
  selectedIds: readonly string[]
): AssignmentPlan {
  let failure: AssignmentRegistrationError["failure"] = "ledger";
  try {
    return withGovernanceLedger((ledger, save) => {
      failure = "provenance";
      const context = resolveProposalContext(ledger, handoff, proposal);
      failure = "proposal";
      const assignments = phaseBAssignmentsSchema.parse(input);
      assertAssignments(context, assignments, selectedIds);
      failure = "ledger";
      const subject = {
        decompositionBinding: context.decomposition.binding,
        staffingBinding: context.staffingBinding,
        snapshot: context.snapshot,
        selectedWorkItemIds: [...selectedIds],
        assignments,
        ...(assignments.some(
          ({ repositoryAccessCeiling }) => repositoryAccessCeiling === "write"
        ) && { writeDetailingVersion: 1 as const }),
      };
      const plan = { ...subject, id: governanceDigest(subject) };
      if (!context.entry.assignmentPlans?.some(({ id }) => id === plan.id)) {
        (context.entry.assignmentPlans ??= []).push(plan);
        save();
      }
      return structuredClone(plan);
    });
  } catch {
    throw new AssignmentRegistrationError(failure);
  }
}

export function resolvePreparedAssignmentPlan(
  ledger: GovernanceLedger,
  handoff: Handoff,
  id: string
) {
  const context = prepareAssignmentContext(ledger, handoff);
  const { entry, decision } = context;
  const plan = entry.assignmentPlans?.find((record) => record.id === id);
  const decomposition = entry.executionDecompositions?.find(
    ({ binding }) => binding === plan?.decompositionBinding
  );
  if (!plan || !decomposition)
    throw new Error("Assignment Plan is unavailable.");
  if (
    decomposition.approvedDecisionId !== decision.id ||
    decomposition.approvalBinding !== governanceDigest(decision) ||
    plan.staffingBinding !== context.staffingBinding ||
    governanceDigest(plan.snapshot) !== governanceDigest(context.snapshot)
  )
    throw new Error("Assignment Plan provenance changed.");
  assertAssignments(
    { ...context, decomposition },
    plan.assignments,
    plan.selectedWorkItemIds
  );
  const specialistSources = context.sources.filter(({ definition }) =>
    plan.assignments.some(({ specialistId }) => specialistId === definition.id)
  );
  return { ...context, plan, decomposition, specialistSources };
}

export function getPreparedAssignmentPlan(handoff: Handoff, id: string) {
  return withGovernanceLedger((ledger) => {
    const { plan, specialistSources, decomposition } =
      resolvePreparedAssignmentPlan(ledger, handoff, id);
    return structuredClone({
      plan,
      specialistSources,
      workItems: decomposition.workItems,
    });
  });
}
