export function selectAssignmentWorkItems<T extends { id: string }>(
  workItems: readonly T[],
  selectedIds: readonly string[]
): T[] | undefined {
  const selected = new Set(selectedIds);
  const items = workItems.filter(({ id }) => selected.has(id));
  if (
    !items.length ||
    selected.size !== selectedIds.length ||
    items.length !== selected.size
  )
    return undefined;
  return items;
}
