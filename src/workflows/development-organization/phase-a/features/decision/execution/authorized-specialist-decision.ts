import {
  claimAuthorizedInvocation,
  type AuthorizedSpecialistInvocation,
} from "@/application/governance/index.js";
import {
  collectIndependentDecisions,
  type AgentDecision,
} from "@/application/specialist/analysis/index.js";

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
  const { authority, ...definition } = specialist;
  const [decision] = await collectIndependentDecisions(snapshot, goal, [
    { specialist: definition, authority, assignmentObjective, files },
  ]);
  return decision;
}
