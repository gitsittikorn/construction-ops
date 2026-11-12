import type { Data } from './models';
import { openLocalDatabase } from './storage';
import { actorUid } from './workspaceIdentity';

export function canonicalLocalUrl(value: string): string | null {
  const url = new URL(value);
  if (url.hostname !== 'localhost' || !['http:', 'https:'].includes(url.protocol)) return null;
  url.hostname = '127.0.0.1';
  return url.href;
}

function containsRecords(data: Data) {
  return (
    [
      'projects',
      'masters',
      'trips',
      'workspaces',
      'audit',
      'deletedProjects',
      'deletedMasters',
      'deletedTrips',
      'deletedWorkspaces',
    ].some((key) => (data[key as keyof Data] as unknown[] | undefined)?.length) ||
    Object.keys(data.sync?.entries ?? {}).length > 0
  );
}

// Never redirect away from legacy business records, backups or attachments unseen.
export async function legacyOriginHasData() {
  const db = await openLocalDatabase();
  try {
    const tx = db.transaction(['state', 'uploads', 'scopedUploads', 'driveSettings'], 'readonly');
    const [states, uploads, scopedUploads, settings] = await Promise.all([
      tx.objectStore('state').getAll(),
      tx.objectStore('uploads').count(),
      tx.objectStore('scopedUploads').count(),
      tx.objectStore('driveSettings').getAll(),
    ]);
    await tx.done;
    return (
      states.some(containsRecords) ||
      uploads > 0 ||
      scopedUploads > 0 ||
      settings.some((setting) => setting?.rootId || Object.keys(setting?.projects ?? {}).length)
    );
  } finally {
    db.close();
  }
}

export async function legacyRecoveryOwners(uid: string | null) {
  const db = await openLocalDatabase();
  try {
    const keys = await db.getAllKeys('state');
    return keys.filter((key): key is string => {
      if (typeof key !== 'string') return false;
      if (key === 'local') return true;
      if (!uid) return false;
      try {
        return actorUid(key) === uid;
      } catch {
        return false;
      }
    });
  } finally {
    db.close();
  }
}
