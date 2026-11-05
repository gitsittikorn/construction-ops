export const driveScope = 'https://www.googleapis.com/auth/drive.file';
export class ApiError extends Error {
  constructor(status, code) {
    super(code);
    this.status = status;
    this.code = code;
  }
}

export function createDriveService({ store, google, vault, now = Date.now }) {
  const pending = new Map();
  // Serialize credential changes per user so renewal cannot undo a disconnect.
  async function locked(uid, operation) {
    const previous = pending.get(uid) ?? Promise.resolve();
    const next = previous.catch(() => {}).then(operation);
    pending.set(uid, next);
    try {
      return await next;
    } finally {
      if (pending.get(uid) === next) pending.delete(uid);
    }
  }
  function publicSession(credentials) {
    if (
      !credentials.access_token ||
      !Number.isFinite(credentials.expiry_date) ||
      credentials.expiry_date <= now() + 60000
    )
      throw new ApiError(503, 'service_unavailable');
    return { token: credentials.access_token, expiresAt: credentials.expiry_date - 60000 };
  }
  function requireScope(credentials) {
    if (!credentials.scope?.split(' ').includes(driveScope))
      throw new ApiError(409, 'reconnect_required');
  }
  async function run(uid, operation, invalidateGrant = false) {
    return locked(uid, async () => {
      try {
        return await operation();
      } catch (error) {
        if (error instanceof ApiError) throw error;
        if (error?.response?.data?.error === 'invalid_grant') {
          if (invalidateGrant) {
            await store.remove(uid);
            throw new ApiError(409, 'reconnect_required');
          }
          throw new ApiError(400, 'invalid_authorization_code');
        }
        // Never return provider responses, credential values or request headers.
        throw new ApiError(503, 'service_unavailable');
      }
    });
  }
  return {
    exchange(user, code, origin) {
      return run(user.uid, async () => {
        const credentials = await google.exchange(code, origin);
        requireScope(credentials);
        const email = await google.email(credentials);
        if (!email || email.toLowerCase() !== user.email.toLowerCase())
          throw new ApiError(403, 'account_mismatch');
        if (!credentials.refresh_token) {
          const previous = await store.get(user.uid);
          if (previous) credentials.refresh_token = vault.open(user.uid, previous).refresh_token;
        }
        if (!credentials.refresh_token) throw new ApiError(409, 'reconnect_required');
        const session = publicSession(credentials);
        await store.put(user.uid, vault.seal(user.uid, credentials));
        return session;
      });
    },
    session(user, force = false) {
      return run(
        user.uid,
        async () => {
          const record = await store.get(user.uid);
          if (!record) throw new ApiError(409, 'reconnect_required');
          let credentials = vault.open(user.uid, record);
          requireScope(credentials);
          if (force || !credentials.access_token || credentials.expiry_date <= now() + 120000) {
            const updated = await google.refresh(credentials.refresh_token);
            credentials = {
              ...credentials,
              ...updated,
              refresh_token: updated.refresh_token || credentials.refresh_token,
              scope: updated.scope || credentials.scope,
            };
            requireScope(credentials);
            publicSession(credentials);
            await store.put(user.uid, vault.seal(user.uid, credentials));
          }
          return publicSession(credentials);
        },
        true,
      );
    },
    disconnect(user) {
      return run(user.uid, () => store.remove(user.uid));
    },
  };
}
