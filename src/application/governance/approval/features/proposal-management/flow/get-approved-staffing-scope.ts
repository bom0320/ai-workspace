import {
  deniedStaffingApproval,
  type StaffingApprovalResult,
} from "../../../shared/model/result.js";
import { withGovernanceLedger } from "../../../../records/governance-transaction.js";
import { validateStoredIssuance } from "./validation/staffing-issuance.js";

// Authenticate the stored issuance and current approval source. Reading a Scope
// still does not authorize an invocation or reserve its execution budget.
export function getApprovedStaffingScope(
  scopeId: string
): StaffingApprovalResult {
  try {
    return withGovernanceLedger((ledger) => {
      for (const entry of Object.values(ledger.repositories)) {
        const issuance = entry.issuances.find(
          ({ scope }) => scope.id === scopeId
        );
        if (!issuance) continue;
        validateStoredIssuance(issuance, entry);
        return {
          status: "approved",
          approval: issuance.approval,
          scope: issuance.scope,
        };
      }
      return deniedStaffingApproval();
    });
  } catch {
    return deniedStaffingApproval();
  }
}
