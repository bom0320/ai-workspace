import { basename, isAbsolute, sep, win32 } from "node:path";

// Existing v1 exact mention policy; selection is independent of file loading.
export function selectGoalMentionedPaths(fileTree: string[], objective: string): string[] {
  const goal = objective.replaceAll("\\", "/");
  const mentions = (name: string): boolean => {
    const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    return new RegExp(`(^|[^a-z0-9_./-])${escaped}(?=$|[^a-z0-9_./-])`, "i").test(goal);
  };
  const names = new Map<string, number>();
  for (const path of fileTree) {
    const name = basename(path).toLowerCase();
    names.set(name, (names.get(name) ?? 0) + 1);
  }
  return fileTree.filter((path) => {
    const name = basename(path).toLowerCase();
    const normalizedPath = path.split(sep).join("/");
    return (normalizedPath.includes("/") && mentions(normalizedPath)) ||
      (names.get(name) === 1 && mentions(name)) ||
      (path.toLowerCase() === "readme.md" && mentions("README"));
  });
}

export function parsePackageScripts(contents: string | undefined): Record<string, string> {
  if (contents === undefined) return {};
  const packageJson: unknown = JSON.parse(contents);
  if (typeof packageJson !== "object" || packageJson === null) return {};
  const scripts: unknown = "scripts" in packageJson ? packageJson.scripts : undefined;
  if (typeof scripts !== "object" || scripts === null || Array.isArray(scripts)) return {};
  return Object.fromEntries(Object.entries(scripts).filter(([, value]) => typeof value === "string"));
}

export function isInternalInspectionComponent(part: string): boolean {
  return [".git", "node_modules", ".ai-workspace"].includes(part);
}

// Existing Decision loader rule; keep its accepted spellings unchanged.
export function isRepositoryRelativePath(path: string): boolean {
  return Boolean(path.trim()) && !isAbsolute(path) && !win32.isAbsolute(path) &&
    !path.split(/[\\/]/).includes("..");
}

// Exact canonical spelling, shared with Governance. No normalization or prefix grant.
export function isUnambiguousRepositoryPath(path: string): boolean {
  return isRepositoryRelativePath(path) && !/[\\:\x00-\x1f\x7f]/.test(path) &&
    path.split("/").every((segment) => segment !== "" && segment !== "." && segment !== "..");
}
