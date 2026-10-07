import { readFileSync, statSync } from "node:fs";
import { isAbsolute, relative, resolve, sep } from "node:path";

import type { InspectionRequest, InspectionResult } from "../model/inspection.js";

export function inspectFiles(
  repositoryRoot: string,
  request: InspectionRequest,
): InspectionResult {
  const seen = new Set<string>();
  const files: { path: string; absolutePath: string }[] = [];

  for (const path of request.paths) {
    if (isAbsolute(path)) {
      throw new Error(`Inspection path must be relative: ${path}`);
    }

    const absolutePath = resolve(repositoryRoot, path);
    const relativePath = relative(repositoryRoot, absolutePath);
    if (
      relativePath === ".." ||
      relativePath.startsWith(`..${sep}`) ||
      isAbsolute(relativePath)
    ) {
      throw new Error(`Inspection path is outside the repository: ${path}`);
    }

    if (
      path.split(sep).some((part) =>
        [".git", "node_modules", ".ai-workspace"].includes(part),
      )
    ) {
      throw new Error(`Inspection path contains a forbidden directory: ${path}`);
    }

    if (!statSync(absolutePath).isFile()) {
      throw new Error(`Inspection path is not a file: ${path}`);
    }

    if (!seen.has(absolutePath)) {
      seen.add(absolutePath);
      files.push({ path, absolutePath });
    }
  }

  return {
    files: files.map(({ path, absolutePath }) => ({
      path,
      content: readFileSync(absolutePath, "utf8"),
    })),
  };
}
