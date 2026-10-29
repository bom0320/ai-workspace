import type { RepositorySnapshot } from "@/contracts/repository-snapshot.js";
import type { CommitFile } from "@/infrastructure/git/index.js";

import type { StaffingContext } from "../protocol/context.js";

// Harness-owned in-memory state. Never accept this state or its access policy
// from a CEO response. It is not durable state, approval, or an authority token.
export type StaffingContextState = {
  snapshot: RepositorySnapshot;
  context: StaffingContext;
  allowedContextPaths: string[];
  files: CommitFile[];
};
