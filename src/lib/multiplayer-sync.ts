export function reconcileVersionedState<T extends { id: string; version: number }>(
  current: T | null | undefined,
  incoming: T,
): T {
  if (!current || current.id !== incoming.id) return incoming;
  return incoming.version >= current.version ? incoming : current;
}

export function reconcileVersionedEvents<T extends { id: number; version: number }>(
  current: readonly T[] | null | undefined,
  incoming: T,
  limit = 40,
): T[] {
  const byId = new Map<number, T>();
  for (const event of current ?? []) byId.set(event.id, event);
  const previous = byId.get(incoming.id);
  if (!previous || incoming.version >= previous.version) byId.set(incoming.id, incoming);
  return [...byId.values()]
    .sort((left, right) => right.version - left.version || right.id - left.id)
    .slice(0, limit);
}

export function mergeServerWithPending<T extends object>(
  current: T | undefined,
  serverPatch: Partial<T>,
  inFlightPatch: Partial<T>,
  pendingPatch: Partial<T>,
): T {
  return {
    ...(current ?? ({} as T)),
    ...serverPatch,
    ...inFlightPatch,
    ...pendingPatch,
  };
}
