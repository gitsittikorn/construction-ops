export interface DriveSession {
  token: string;
  expiresAt: number;
}
const sessions = new Map<string, DriveSession>();
const clientId = import.meta.env.VITE_GOOGLE_CLIENT_ID ?? '';
const backend = (import.meta.env.VITE_DRIVE_BACKEND_URL ?? '').replace(/\/$/, '');
// A token from another OAuth application or transport cannot establish this connection.
// Retain the old key/other contexts untouched so configuration changes never erase them.
const storageKey = clientId
  ? `construction-ops.drive-session:${encodeURIComponent(clientId)}:${encodeURIComponent(backend)}`
  : 'construction-ops.drive-session';
// Tab-scoped credentials survive reloads, but are never stored in localStorage.
function readStored(): { owner: string; session: DriveSession } | null {
  try {
    const value = JSON.parse(sessionStorage.getItem(storageKey) ?? 'null');
    if (
      typeof value?.owner === 'string' &&
      typeof value.session?.token === 'string' &&
      value.session.token &&
      Number.isFinite(value.session.expiresAt) &&
      value.session.expiresAt > Date.now()
    )
      return value;
    sessionStorage.removeItem(storageKey);
  } catch {
    // Storage may be blocked; in-memory connections still work.
  }
  return null;
}
function removeStored() {
  try {
    sessionStorage.removeItem(storageKey);
  } catch {
    // Storage may be blocked.
  }
}
export function getDriveSession(owner: string): DriveSession | null {
  const stored = readStored();
  const session = sessions.get(owner) ?? (stored?.owner === owner ? stored.session : null);
  if (!session || session.expiresAt <= Date.now()) {
    sessions.delete(owner);
    if (stored?.owner === owner) removeStored();
    return null;
  }
  return { ...session };
}
export function saveDriveSession(owner: string, session: DriveSession) {
  sessions.set(owner, { ...session });
  try {
    sessionStorage.setItem(storageKey, JSON.stringify({ owner, session }));
  } catch {
    // Fall back to memory when browser storage is unavailable.
  }
}
export function clearDriveSession(owner: string) {
  sessions.delete(owner);
  if (readStored()?.owner === owner) removeStored();
}
export function clearDriveSessionsExcept(owner: string) {
  for (const key of sessions.keys()) {
    if (key !== owner) sessions.delete(key);
  }
  if (readStored()?.owner !== owner) removeStored();
}
export function clearDriveSessions() {
  sessions.clear();
  removeStored();
}
