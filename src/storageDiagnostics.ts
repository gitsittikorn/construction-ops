import type { Data } from './models';
import { openLocalDatabase } from './storage';
import { actorUid, companyRole } from './workspaceIdentity';

export function dataCounts(data: Data) {
  const entries = Object.values(data.sync?.entries ?? {});
  return {
    projects: data.projects.length,
    masters: Object.fromEntries(
      ['truck', 'driver', 'source', 'customer', 'soilType', 'tag'].map((kind) => [
        kind,
        data.masters.filter((master) => master.kind === kind).length,
      ]),
    ),
    trips: data.trips.length,
    workspaces: data.workspaces?.length ?? 0,
    deletedMasters: data.deletedMasters?.length ?? 0,
    pending: entries.filter((entry) => entry.status === 'pending').length,
    acknowledged: entries.filter((entry) => entry.status === 'synced').length,
    conflicts: entries.filter((entry) => entry.status === 'conflict').length,
    failed: entries.filter((entry) => Boolean(entry.error)).length,
    restoredAt: data.sync?.restoredAt ?? null,
  };
}

// Local development diagnostics only: counts, never owner keys or business payloads.
export async function inspectStoredNamespaces(currentOwner: string) {
  const database = await openLocalDatabase();
  try {
    const transaction = database.transaction('state', 'readonly');
    const keys = await transaction.store.getAllKeys();
    const values = await Promise.all(keys.map((key) => transaction.store.get(key)));
    await transaction.done;
    return keys.slice(0, 100).map((key, index) => {
      const backup = Array.isArray(key);
      const owner = backup ? key[1] : key;
      let relation = 'other-account';
      if (owner === currentOwner) relation = 'current';
      else if (owner === 'local') relation = 'local-mode';
      else if (typeof owner === 'string' && actorUid(owner) === actorUid(currentOwner))
        relation = 'same-account-other-workspace';
      const data = values[index] as Data;
      return {
        namespace: index + 1,
        relation,
        backup: backup ? String(key[0]) : null,
        role: typeof owner === 'string' ? companyRole(owner) : null,
        counts: dataCounts(data),
      };
    });
  } finally {
    database.close();
  }
}
