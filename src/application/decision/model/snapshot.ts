// A governed Git state reference, not a copy of the repository.
export type RepositorySnapshot = {
  repositoryRoot: string;
  commitSha: string;
};
