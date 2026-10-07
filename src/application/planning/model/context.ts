export type RepositoryContext = {
  repositoryRoot: string;
  repositoryName: string;
  fileTree: string[];
  packageScripts: Record<string, string>;
  instructions?: string;
};
