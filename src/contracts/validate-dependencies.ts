// Validate references, then consume items whose prerequisites have been visited.
export function validateDependencies(
  items: readonly { id: string; dependsOn: readonly string[] }[],
  kind = "Work Item"
): string | undefined {
  const dependents = new Map(items.map(({ id }) => [id, [] as string[]]));
  if (dependents.size !== items.length) return `Duplicate ${kind} ID.`;

  const remaining = new Map<string, number>();
  const ready: string[] = [];
  for (const { id, dependsOn } of items) {
    const dependencies = new Set(dependsOn);
    remaining.set(id, dependencies.size);
    if (dependencies.size === 0) ready.push(id);
    for (const dependency of dependencies) {
      if (dependency === id) return `${kind} cannot depend on itself.`;
      const waiting = dependents.get(dependency);
      if (!waiting) return `Unknown ${kind} dependency.`;
      waiting.push(id);
    }
  }

  for (const id of ready) {
    for (const dependent of dependents.get(id)!) {
      const count = remaining.get(dependent)! - 1;
      remaining.set(dependent, count);
      if (count === 0) ready.push(dependent);
    }
  }
  if (ready.length !== items.length) return `Cyclic ${kind} dependencies.`;
}
