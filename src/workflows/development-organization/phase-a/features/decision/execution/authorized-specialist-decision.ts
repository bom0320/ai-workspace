import {
  claimAuthorizedInvocation,
  type AuthorizedSpecialistInvocation,
} from "@/application/governance/index.js";
import {
  runIndependentDecisions,
  type AgentDecision,
} from "@/application/decision/index.js";

// Claim's generic denial is intentionally not classified into finer causes.
export class InvocationClaimError extends Error {
  constructor(reason: string) {
    super(reason);
    this.name = "InvocationClaimError";
  }
}

export async function runAuthorizedSpecialistDecision(
  input: AuthorizedSpecialistInvocation
): Promise<AgentDecision> {
  // 1. Claim Authorized Invocation
  const claim = claimAuthorizedInvocation(input);
  if (claim.status !== "claimed") throw new InvocationClaimError(claim.reason);

  // 2. Execute Specialist Decision
  // Use the Claim-returned input. A later v2 failure leaves the Claim consumed,
  // so propagate it without retrying or re-authorizing this Invocation.
  const { snapshot, goal, specialist, assignmentObjective, files } =
    claim.invocation;
  const [decision] = await runIndependentDecisions(snapshot, goal, [
    { specialist, assignmentObjective, files },
  ]);
  return decision;
}
