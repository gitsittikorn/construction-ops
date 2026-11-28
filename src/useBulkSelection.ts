import { useState } from 'react';

/**
 * Selection by record ID. `scope` names what is being looked at (owner, tab, search, filters);
 * changing it clears the selection so nothing outside the current view stays selected.
 */
export function useBulkSelection(ids: string[], scope: string) {
  const [state, setState] = useState<{ scope: string; ids: string[] }>({ scope, ids: [] });
  // A different view forgets the selection for good, even if the user switches back.
  if (state.scope !== scope) setState({ scope, ids: [] });
  const available = new Set(ids);
  const selected = new Set(
    state.scope === scope ? state.ids.filter((id) => available.has(id)) : [],
  );
  const update = (change: (next: Set<string>) => void) => {
    const next = new Set(selected);
    change(next);
    setState({ scope, ids: [...next] });
  };
  return {
    selected,
    count: selected.size,
    total: ids.length,
    has: (id: string) => selected.has(id),
    toggle: (id: string) =>
      update((next) => {
        if (!next.delete(id)) next.add(id);
      }),
    setMany: (many: string[], on: boolean) =>
      update((next) => {
        for (const id of many)
          if (on) next.add(id);
          else next.delete(id);
      }),
    selectAll: () => setState({ scope, ids }),
    /** Keep only these IDs selected, for example the ones that could not be deleted. */
    keep: (kept: string[]) => setState({ scope, ids: kept }),
    clear: () => setState({ scope, ids: [] }),
  };
}
export type BulkSelection = ReturnType<typeof useBulkSelection>;
