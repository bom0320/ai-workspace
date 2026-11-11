import {
  claimAuthorizedInvocation,
  type AuthorizedSpecialistInvocation,
} from "@/application/governance/index.js";
import {
  runIndependentDecisions,
  type AgentDecision,
} from "@/application/decision/index.js";

export async function runAuthorizedSpecialistDecision(
  input: AuthorizedSpecialistInvocation
): Promise<AgentDecision> {
  const claim = claimAuthorizedInvocation(input);
  if (claim.status !== "claimed") throw new Error(claim.reason);

  const { snapshot, goal, specialist, assignmentObjective, files } =
    claim.invocation;
  const [decision] = await runIndependentDecisions(snapshot, goal, [
    { specialist, assignmentObjective, files },
  ]);
  return decision;
}
