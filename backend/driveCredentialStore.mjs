import { createHash } from 'node:crypto';

export function createDriveCredentialStore(db, clientId) {
  if (typeof clientId !== 'string' || !clientId.trim() || clientId !== clientId.trim())
    throw Error('A configured OAuth client is required');
  const clientKey = createHash('sha256').update(clientId).digest('hex');
  const ref = (uid) =>
    db.collection('_driveCredentials').doc(uid).collection('oauthClients').doc(clientKey);
  // Never read, overwrite or delete the original unbound parent document.
  return {
    async get(uid) {
      const snapshot = await ref(uid).get();
      return snapshot.exists ? snapshot.data() : null;
    },
    async put(uid, data) {
      await ref(uid).set(data);
    },
    async remove(uid) {
      await ref(uid).delete();
    },
  };
}
