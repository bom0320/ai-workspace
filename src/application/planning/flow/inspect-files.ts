import { readFileSync, statSync } from "node:fs";
import { isAbsolute, normalize, relative, resolve, sep } from "node:path";

import type { InspectRequest } from "../protocol/inspection.js";
import type { InspectResult } from "../protocol/inspection.js";

export class InspectionRequestError extends Error {
  override name = "InspectionRequestError";
}

export function inspectFiles(
  repositoryRoot: string,
  request: InspectRequest,
): InspectResult {
  const seen = new Set<string>();
  const files: { path: string; absolutePath: string }[] = [];

  try {
    for (const path of request.paths) {
      if (isAbsolute(path)) {
        throw new InspectionRequestError(`Inspection path must be relative: ${path}`);
      }

      const absolutePath = resolve(repositoryRoot, path);
      const relativePath = relative(repositoryRoot, absolutePath);
      if (
        relativePath === ".." ||
        relativePath.startsWith(`..${sep}`) ||
        isAbsolute(relativePath)
      ) {
        throw new InspectionRequestError(`Inspection path is outside the repository: ${path}`);
      }

      if (
        [
          ...normalize(path).split(sep),
          // Preserve forbidden components removed by normalization.
          ...path.split(sep === "\\" ? /[\\/]/ : sep),
        ].some((part) =>
          [".git", "node_modules", ".ai-workspace"].includes(part),
        )
      ) {
        throw new InspectionRequestError(`Inspection path contains a forbidden directory: ${path}`);
      }

      if (!statSync(absolutePath).isFile()) {
        throw new InspectionRequestError(`Inspection path is not a file: ${path}`);
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
  } catch (error) {
    if (
      error instanceof Error && "code" in error &&
      ["ENOENT", "ENOTDIR", "EISDIR"].includes(String(error.code))
    ) {
      throw new InspectionRequestError(error.message, { cause: error });
    }
    throw error;
  }
}
