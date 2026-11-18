import type { WorkItem } from "../../model/work.js";

// Validate references, then consume items whose prerequisites have been visited.
export function validateDependencies(
  workItems: WorkItem[]
): string | undefined {
  const dependents = new Map(workItems.map(({ id }) => [id, [] as string[]]));
  if (dependents.size !== workItems.length) return "Duplicate Work Item ID.";

  const remaining = new Map<string, number>();
  const ready: string[] = [];
  for (const { id, dependsOn } of workItems) {
    const dependencies = new Set(dependsOn);
    remaining.set(id, dependencies.size);
    if (dependencies.size === 0) ready.push(id);
    for (const dependency of dependencies) {
      if (dependency === id) return "Work Item cannot depend on itself.";
      const items = dependents.get(dependency);
      if (!items) return "Unknown Work Item dependency.";
      items.push(id);
    }
  }

  for (const id of ready) {
    for (const dependent of dependents.get(id)!) {
      const count = remaining.get(dependent)! - 1;
      remaining.set(dependent, count);
      if (count === 0) ready.push(dependent);
    }
  }
  if (ready.length !== workItems.length)
    return "Cyclic Work Item dependencies.";
}
