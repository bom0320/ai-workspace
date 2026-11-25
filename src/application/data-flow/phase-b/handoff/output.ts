import type {
  SynthesisContext,
  SynthesisProposal,
} from "@/application/synthesis/index.js";
import type { RepositorySnapshot } from "@/contracts/repository/snapshot.js";

// The approval pair stays in Handoff input. The Workflow receives the approved
// analysis and its references without the Ledger entry or current policy.
export type HandoffOutput = {
  context: SynthesisContext;
  synthesisProposal: SynthesisProposal;
  snapshot: RepositorySnapshot;
  analysisSources: {
    scopeId: string;
    scopeVersion: number;
    assignmentId: string;
    specialistId: string;
  }[];
};
