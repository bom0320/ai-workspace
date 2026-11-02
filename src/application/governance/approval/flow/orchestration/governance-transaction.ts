import { withGovernanceRecords } from "@/services/governance-records/index.js";
import {
  governanceLedgerSchema,
  type GovernanceLedger,
  type StaffingApprovalResult,
} from "../../model/approval.js";

// Schema checks and every domain operation stay under the service's lock.
// save() validates and persists this same transaction's ledger, not a new read.
export function withGovernanceLedger<T>(
  action: (ledger: GovernanceLedger, save: () => void) => T
): T {
  return withGovernanceRecords((raw, persist) => {
    const ledger = governanceLedgerSchema.parse(raw);
    return action(ledger, () => persist(governanceLedgerSchema.parse(ledger)));
  });
}

export function deniedStaffingApproval(): StaffingApprovalResult {
  return {
    status: "denied",
    reason:
      "Approval denied: invalid or untrusted records, System Policy violation, stale approval/delegation, duplicate Proposal or Snapshot drift.",
  };
}
