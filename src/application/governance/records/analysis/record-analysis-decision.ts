import {
  agentDecisionSchema,
  type AgentDecision,
} from "@/application/decision/index.js";
import { governanceDigest } from "@/services/governance-records/index.js";
import { withGovernanceLedger } from "../governance-transaction.js";
import type { AuthorizedSpecialistInvocation } from "../../model/authority.js";

// Called only by the trusted workflow after v2 successfully returns.
export function recordAnalysisDecision(
  invocation: AuthorizedSpecialistInvocation,
  decision: AgentDecision
): void {
  const parsed = agentDecisionSchema.parse(decision);
  withGovernanceLedger((ledger, save) => {
    const matches = Object.values(ledger.repositories).flatMap(
      ({ reservations }) =>
        (reservations ?? []).filter(
          ({ invocationId }) => invocationId === invocation.invocationId
        )
    );
    const record = matches[0];
    if (
      matches.length !== 1 ||
      !record.claimedAt ||
      record.decisionDigest ||
      record.invocationDigest !== governanceDigest(invocation) ||
      parsed.specialistId !== invocation.specialist.id
    )
      throw new Error(
        "Decision is not bound to an unused, claimed invocation."
      );
    record.decisionDigest = governanceDigest(parsed);
    save();
  });
}
