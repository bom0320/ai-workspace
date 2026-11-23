import { governanceDigest } from "@/services/governance-records/index.js";
import {
  phaseBAssignmentsSchema,
  validateAssignmentProposal,
  type PhaseBAssignment,
} from "@/contracts/phase-b-assignment.js";
import type { AssignmentPlan } from "../../model/assignment-plan.js";
import { withGovernanceLedger } from "../governance-transaction.js";
import {
  resolvePlanContext,
  resolveProposalContext,
  type Handoff,
  type Proposal,
} from "./resolve-assignment-context.js";

export class AssignmentRegistrationError extends Error {
  constructor(public readonly failure: "provenance" | "proposal" | "ledger") {
    super("Assignment Plan could not be registered.");
  }
}

function assertAssignments(
  context: ReturnType<typeof resolveProposalContext>,
  assignments: PhaseBAssignment[],
  selectedIds?: readonly string[]
) {
  const workItems = context.decomposition.workItems.filter(
    ({ id }) => !selectedIds || selectedIds.includes(id)
  );
  const reason = validateAssignmentProposal(assignments, workItems);
  if (reason) throw new Error(reason);
  for (const { executor } of assignments) {
    if (
      executor.kind === "specialist"
        ? !context.specialistAllowed ||
          !context.sources.some(
            ({ definition }) => definition.id === executor.specialistId
          )
        : !context.workerAllowed
    )
      throw new Error(
        "Assignment executor is outside approved preparation bounds."
      );
  }
}

// Internal writer. The proposal is untrusted, even after it has passed the agent boundary.
export function registerAssignmentPlan(
  handoff: Handoff,
  proposal: Proposal,
  input: unknown,
  selectedIds?: readonly string[]
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
        assignments,
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

export function getPreparedAssignmentPlan(handoff: Handoff, id: string) {
  return withGovernanceLedger((ledger) => {
    const context = resolvePlanContext(ledger, handoff);
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
    assertAssignments({ ...context, decomposition }, plan.assignments);
    const specialistSources = context.sources.filter(({ definition }) =>
      plan.assignments.some(
        ({ executor }) =>
          executor.kind === "specialist" &&
          executor.specialistId === definition.id
      )
    );
    return structuredClone({ plan, specialistSources });
  });
}
