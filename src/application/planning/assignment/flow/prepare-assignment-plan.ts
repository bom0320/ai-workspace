import {
  AssignmentRegistrationError,
  getAssignmentPlanContext,
  registerAssignmentPlan,
} from "@/application/governance/index.js";
import {
  phaseBAssignmentsSchema,
  selectAssignmentWorkItems,
  validateAssignmentProposal,
} from "@/contracts/phase-b-assignment.js";

export type AssignmentPlanAgent = (
  context: ReturnType<typeof getAssignmentPlanContext>
) => Promise<unknown>;

const failureReasons = {
  agent: "Assignment Planning agent failed.",
  proposal:
    "Assignment proposal did not match the selected Work Items or contract.",
  provenance:
    "Assignment Plan approval provenance or Snapshot could not be verified.",
  ledger: "Assignment Plan could not be recorded.",
};

function denied(failure: keyof typeof failureReasons) {
  return {
    status: "denied" as const,
    failure,
    reason: failureReasons[failure],
  };
}

export async function prepareAssignmentPlan(
  handoff: Parameters<typeof registerAssignmentPlan>[0],
  proposal: Parameters<typeof registerAssignmentPlan>[1],
  selectedIds: readonly string[],
  agent: AssignmentPlanAgent
) {
  let context: ReturnType<typeof getAssignmentPlanContext>;
  try {
    context = getAssignmentPlanContext(handoff, proposal);
  } catch {
    return denied("provenance");
  }

  const selection = [...selectedIds];
  const workItems = selectAssignmentWorkItems(context.workItems, selection);
  if (!workItems) return denied("proposal");

  let input: unknown;
  try {
    input = await agent(structuredClone({ ...context, workItems }));
  } catch {
    return denied("agent");
  }

  const parsed = phaseBAssignmentsSchema.safeParse(input);
  if (
    !parsed.success ||
    validateAssignmentProposal(parsed.data, workItems, {
      specialistIds: context.specialists.map(({ id }) => id),
      repositoryAccessCeilings: context.repositoryAccessCeilings,
    })
  )
    return denied("proposal");

  try {
    return {
      status: "prepared" as const,
      plan: registerAssignmentPlan(handoff, proposal, parsed.data, selection),
    };
  } catch (error) {
    return denied(
      error instanceof AssignmentRegistrationError ? error.failure : "ledger"
    );
  }
}
