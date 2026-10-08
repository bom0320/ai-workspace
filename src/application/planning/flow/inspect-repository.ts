import { readFileSync, readdirSync } from "node:fs";
import { basename, join } from "node:path";

import type { RepositoryInfo } from "../model/state.js";

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

function readPackageScripts(repositoryRoot: string): Record<string, string> {
  const contents = readOptionalFile(join(repositoryRoot, "package.json"));
  if (contents === undefined) {
    return {};
  }

  const packageJson: unknown = JSON.parse(contents);
  if (typeof packageJson !== "object" || packageJson === null) {
    return {};
  }

  const scripts: unknown = "scripts" in packageJson ? packageJson.scripts : undefined;
  if (typeof scripts !== "object" || scripts === null || Array.isArray(scripts)) {
    return {};
  }

  return Object.fromEntries(
    Object.entries(scripts).filter(([, value]) => typeof value === "string"),
  );
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
        if ([".git", "node_modules", ".ai-workspace"].includes(entry.name)) {
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
    packageScripts: readPackageScripts(repositoryRoot),
    instructions: readOptionalFile(join(repositoryRoot, "AGENTS.md")),
  };
}
