import { readFileSync, readdirSync } from "node:fs";
import { basename, join } from "node:path";

import {
  isInternalInspectionComponent,
  parsePackageScripts,
} from "@/services/repository-inspection/index.js";

import type { RepositoryInfo } from "../../model/state.js";

function readOptionalFile(path: string): string | undefined {
  try {
    return readFileSync(path, "utf8");
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      return undefined;
    }
    throw error;
  }
}

export function inspectRepository(repositoryRoot: string): RepositoryInfo {
  const fileTree: string[] = [];

  function collectFiles(relativeDirectory: string): void {
    const entries = readdirSync(join(repositoryRoot, relativeDirectory), {
      withFileTypes: true,
    });

    for (const entry of entries) {
      const relativePath = join(relativeDirectory, entry.name);
      if (entry.isDirectory()) {
        if (isInternalInspectionComponent(entry.name)) {
          continue;
        }
        collectFiles(relativePath);
      } else if (entry.isFile()) {
        fileTree.push(relativePath);
      }
    }
  }

  collectFiles("");

  return {
    repositoryRoot,
    repositoryName: basename(repositoryRoot),
    fileTree: fileTree.sort(),
    packageScripts: parsePackageScripts(
      readOptionalFile(join(repositoryRoot, "package.json"))
    ),
    instructions: readOptionalFile(join(repositoryRoot, "AGENTS.md")),
  };
}
