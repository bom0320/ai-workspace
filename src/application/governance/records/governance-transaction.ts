import { realpathSync } from "node:fs";
import { resolveRepositoryRoot } from "@/infrastructure/git/index.js";
import {
  assertGovernanceStoreOutsideRepository,
  withGovernanceRecords,
} from "@/services/governance-records/index.js";
import {
  governanceLedgerSchema,
  type GovernanceLedger,
} from "../model/ledger.js";

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

export function resolveGovernanceRepository(input: string): string {
  const root = realpathSync(resolveRepositoryRoot(input));
  assertGovernanceStoreOutsideRepository(root);
  return root;
}
