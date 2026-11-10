import { initializeApp, applicationDefault } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { getFirestore } from 'firebase-admin/firestore';
import { OAuth2Client } from 'google-auth-library';
import { createApp } from './app.mjs';
import { createDriveService } from './driveService.mjs';
import { createTokenVault } from './tokenVault.mjs';
import { companyAuthorization } from './companyAuthorization.mjs';
import { createAccessService } from './accessService.mjs';
import { createAccessStore } from './accessStore.mjs';
import { accessPolicy } from './accessModel.mjs';

function required(name) {
  const value = process.env[name]?.trim();
  if (!value) throw Error(`Missing server configuration: ${name}`);
  return value;
}
const projectId = required('CONSTRUCTION_FIREBASE_PROJECT_ID');
const clientId = required('GOOGLE_OAUTH_CLIENT_ID');
const clientSecret = required('GOOGLE_OAUTH_CLIENT_SECRET');
const allowedOrigins = required('CORS_ORIGINS')
  .split(',')
  .map((value) => value.trim());
for (const origin of allowedOrigins) {
  const url = new URL(origin);
  if (
    url.origin !== origin ||
    (url.protocol !== 'https:' && !['localhost', '127.0.0.1'].includes(url.hostname))
  )
    throw Error('CORS_ORIGINS must contain exact HTTPS origins or local development origins');
}
initializeApp({ credential: applicationDefault(), projectId });
const db = getFirestore();
const accessService = createAccessService({
  store: createAccessStore(db),
  auth: getAuth(),
  requireAdminMfa: process.env.ACCESS_REQUIRE_ADMIN_MFA === 'true',
});
const collection = db.collection('_driveCredentials');
const store = {
  async get(uid) {
    const snapshot = await collection.doc(uid).get();
    return snapshot.exists ? snapshot.data() : null;
  },
  async put(uid, data) {
    await collection.doc(uid).set(data);
  },
  async remove(uid) {
    await collection.doc(uid).delete();
  },
};
function client(redirectUri) {
  return new OAuth2Client({
    clientId,
    clientSecret,
    redirectUri,
    eagerRefreshThresholdMillis: 120000,
    transporterOptions: { timeout: 20000 },
  });
}
const google = {
  async exchange(code, origin) {
    return (await client(origin).getToken({ code, redirect_uri: origin })).tokens;
  },
  async refresh(refreshToken) {
    const oauth = client();
    oauth.setCredentials({ refresh_token: refreshToken });
    return (await oauth.refreshAccessToken()).credentials;
  },
  async email(credentials) {
    const oauth = client();
    oauth.setCredentials(credentials);
    const response = await oauth.request({
      url: 'https://www.googleapis.com/drive/v3/about?fields=user(emailAddress)',
      timeout: 20000,
    });
    return response.data.user?.emailAddress;
  },
};
const service = createDriveService({
  store,
  google,
  vault: createTokenVault(required('DRIVE_TOKEN_ENCRYPTION_KEY')),
});
const app = createApp({
  service,
  allowedOrigins,
  accessService,
  verifyIdentity: (token) => getAuth().verifyIdToken(token, true),
  async verifyUser(token, companyId) {
    const user = await getAuth().verifyIdToken(token, true);
    const data = async (ref) => {
      const snapshot = await ref.get();
      return snapshot.exists ? snapshot.data() : null;
    };
    const company = companyId || user.uid;
    if (typeof company !== 'string' || !company || company.length > 128 || company.includes('/'))
      return { ...user, enabled: false };
    const profile = await data(db.collection('companies').doc(company));
    if (profile?.accessPolicy === accessPolicy) {
      const grant = await accessService.authorize(user, company);
      return { ...user, enabled: grant.role !== 'viewer' };
    }
    const enabled = await companyAuthorization(user.uid, companyId, {
      admin: (uid) => data(db.collection('admins').doc(uid)),
      company: (id) => data(db.collection('companies').doc(id)),
      member: (id, uid) => data(db.collection('companies').doc(id).collection('members').doc(uid)),
    });
    return { ...user, enabled };
  },
});
app.listen(process.env.PORT || 3000, '0.0.0.0', () =>
  console.log('Construction Ops backend listening'),
);
