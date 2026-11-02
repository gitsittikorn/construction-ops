export interface DriveSession {
  token: string;
  expiresAt: number;
}
const sessions = new Map<string, DriveSession>();
// Memory only: survives page navigation, never survives refresh or account logout.
export function getDriveSession(owner: string): DriveSession | null {
  const session = sessions.get(owner);
  if (!session || session.expiresAt <= Date.now()) {
    sessions.delete(owner);
    return null;
  }
  return { ...session };
}
export function saveDriveSession(owner: string, session: DriveSession) {
  sessions.set(owner, { ...session });
}
export function clearDriveSession(owner: string) {
  sessions.delete(owner);
}
export function clearDriveSessions() {
  sessions.clear();
}
