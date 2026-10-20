import { z } from "zod";

// A governed Git state reference, not a copy of the repository.
// Structural parsing does not check HEAD, cleanliness or commit existence.
export const repositorySnapshotSchema = z.object({
  repositoryRoot: z.string().min(1),
  commitSha: z.string().min(1),
}).strict();

export type RepositorySnapshot = z.infer<typeof repositorySnapshotSchema>;
