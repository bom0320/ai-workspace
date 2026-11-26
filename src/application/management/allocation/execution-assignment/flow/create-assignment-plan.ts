import type { CreateAssignmentPlanInput } from "../data-flow/input.js";
import type { AssignmentPlanningOutput } from "../data-flow/output.js";
import {
  AssignmentRegistrationError,
  getAssignmentPlanContext,
  registerAssignmentPlan,
} from "@/application/governance/index.js";
import { executionAssignmentsSchema } from "@/contracts/management/execution-assignment.js";
import { selectAssignmentWorkItems } from "@/contracts/management/select-assignment-work-items.js";
import { validateAssignmentProposal } from "@/contracts/management/validate-assignment-proposal.js";

export type AssignmentPlanAgent = (
  context: ReturnType<typeof getAssignmentPlanContext> & {
    workItems: CreateAssignmentPlanInput["proposal"]["workItems"];
    repositoryAccessGuidance: { read: string; write: string };
  }
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

export async function createAssignmentPlan(
  { handoff, proposal, selectedWorkItemIds }: CreateAssignmentPlanInput,
  agent: AssignmentPlanAgent
): Promise<AssignmentPlanningOutput> {
  let context: ReturnType<typeof getAssignmentPlanContext>;
  try {
    context = getAssignmentPlanContext(handoff, proposal);
  } catch {
    return denied("provenance");
  }

  const selection = [...selectedWorkItemIds];
  const workItems = selectAssignmentWorkItems(proposal.workItems, selection);
  if (!workItems) return denied("proposal");

  let input: unknown;
  try {
    input = await agent(
      structuredClone({
        ...context,
        workItems,
        repositoryAccessGuidance: {
          read: "Choose read for analysis, research, design or review that requires no repository changes.",
          write:
            "Choose write only when the assignment objective and deliverable call for implementing or modifying repository files.",
        },
      })
    );
  } catch {
    return denied("agent");
  }

  const parsed = executionAssignmentsSchema.safeParse(input);
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
