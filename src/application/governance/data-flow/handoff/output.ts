import type {
  SynthesisContext,
  SynthesisProposal,
} from "@/application/management/decision-support/synthesis/index.js";
import type { RepositorySnapshot } from "@/contracts/repository/snapshot.js";

export type VerifiedPhaseBContext = {
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
