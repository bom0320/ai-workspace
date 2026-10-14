export type RepositoryAccess = "none" | "read" | "write";

export type SpecialistAuthority = {
  repositoryAccess: RepositoryAccess;
  shellExecution: boolean;
};
