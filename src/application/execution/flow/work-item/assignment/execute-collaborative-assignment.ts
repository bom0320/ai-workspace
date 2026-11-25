import type {
  AssignmentExecutionError,
  AssignmentExecutionRequest,
  reserveAssignmentExecution,
} from "@/application/governance/index.js";

type Handoff = Parameters<typeof reserveAssignmentExecution>[0];
type Failure = AssignmentExecutionError["failure"];

type CollaborativeAssignmentOutcome =
  | { status: "denied"; failure: Failure }
  | {
      status: "failed";
      failure: Failure;
      invocationId: string;
      failureRecorded: boolean;
    }
  | { status: "completed"; invocationId: string; resultDigest: string };

// Governance issues metadata-only permits. The execution entry point remains
// closed until an authorized Context provider can consume a Claim.
export async function executeCollaborativeAssignment(
  _handoff: Handoff,
  _request: Extract<AssignmentExecutionRequest, { access: "read" }>
): Promise<CollaborativeAssignmentOutcome> {
  return { status: "denied", failure: "unsupported" };
}
