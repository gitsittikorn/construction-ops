import { actorUid, companyId, cacheOwner, getWorkspaceSession } from './workspaceIdentity';
import { initializeApp } from 'firebase/app';
import {
  getAuth,
  GoogleAuthProvider,
  signInWithPopup,
  signOut,
  onAuthStateChanged,
  type User,
} from 'firebase/auth';
import { getFirestore, doc, runTransaction, serverTimestamp } from 'firebase/firestore';
import type { UploadRecord } from './uploads';
import { withDeadline, connectionMessage } from './async';
const config = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
};
export const configured = Object.values(config).every(Boolean);
const app = configured ? initializeApp(config) : null;
const auth = app ? getAuth(app) : null;
export const observeAuth = (callback: (user: User | null) => void) =>
  auth ? onAuthStateChanged(auth, callback) : () => {};
export const login = async () => {
  if (!auth) throw Error('ยังไม่ได้ตั้งค่า Firebase');
  return signInWithPopup(auth, new GoogleAuthProvider());
};
export const logout = async () => {
  if (auth) await signOut(auth);
};
export function getSessionIdentity() {
  return auth?.currentUser
    ? { uid: auth.currentUser.uid, email: auth.currentUser.email ?? '' }
    : null;
}
export async function getFirebaseIdToken(owner: string) {
  const user = auth?.currentUser;
  if (!user || user.uid !== owner) throw Error('กรุณาเข้าสู่ระบบก่อนเชื่อมต่อ backend');
  return user.getIdToken();
}
export function identityDatabase() {
  if (!app || !auth?.currentUser) throw Error('กรุณาเข้าสู่ระบบก่อนเชื่อมต่อ');
  return getFirestore(app);
}
export function ownerDatabase(owner: string) {
  const scope = getWorkspaceSession();
  if (
    !app ||
    auth?.currentUser?.uid !== actorUid(owner) ||
    (scope && cacheOwner(scope) !== owner) ||
    (companyId(owner) !== actorUid(owner) && !scope)
  )
    throw Error('กรุณาเลือกบริษัทและเข้าสู่ระบบก่อนเชื่อมต่อ');
  return getFirestore(app);
}
export async function resolveDriveFolders(
  owner: string,
  key: string,
  candidate: Record<string, string>,
): Promise<Record<string, string>> {
  const db = ownerDatabase(owner),
    ref = doc(db, 'users', companyId(owner), 'driveFolders', key);
  return boundedFirestore(
    runTransaction(db, async (transaction) => {
      const existing = await transaction.get(ref);
      if (existing.exists()) return existing.data() as Record<string, string>;
      transaction.set(ref, candidate);
      return candidate;
    }),
  );
}
async function boundedFirestore<T>(operation: Promise<T>): Promise<T> {
  try {
    return await withDeadline(
      operation,
      20000,
      'รอ Firestore นานเกินไป กรุณาตรวจอินเทอร์เน็ตและฐานข้อมูล (default) แล้วลองใหม่ ไฟล์ต้นฉบับยังอยู่ในเครื่อง',
    );
  } catch (error) {
    throw Error(connectionMessage(error));
  }
}
export async function saveDocumentMetadata(owner: string, record: UploadRecord) {
  const db = ownerDatabase(owner),
    ref = doc(db, 'users', companyId(owner), 'documents', record.id);
  const metadata = {
    ...(record.evidenceId
      ? {
          evidenceId: record.evidenceId,
          driverId: record.driverId,
          truckId: record.truckId,
          workDate: record.workDate,
          category: record.category,
        }
      : {}),
    id: record.id,
    owner: companyId(owner),
    projectId: record.projectId,
    tripId: record.tripId,
    fileId: record.driveId,
    folderId: record.folderId,
    name: record.name,
    mimeType: record.mimeType,
    size: record.size,
    createdAt: record.createdAt,
    status: 'synced',
  };
  await boundedFirestore(
    runTransaction(db, async (transaction) => {
      const previous = await transaction.get(ref);
      if (previous.exists()) {
        const remote = previous.data();
        if (Object.entries(metadata).some(([key, value]) => remote[key] !== value))
          throw Error('Metadata บนเซิร์ฟเวอร์ไม่ตรงกัน กรุณาตรวจสอบ');
        return;
      }
      transaction.set(ref, { ...metadata, uploadedAt: serverTimestamp() });
      transaction.set(doc(db, 'users', companyId(owner), 'audit', `upload-${record.id}`), {
        entityId: record.id,
        action: 'upload',
        actor: actorUid(owner),
        at: serverTimestamp(),
        fileId: record.driveId,
      });
    }),
  );
}
export async function resolveEvidenceFolder(
  owner: string,
  key: string,
  candidate: { id: string; parentId: string; name: string },
) {
  const db = ownerDatabase(owner),
    ref = doc(db, 'users', companyId(owner), 'evidenceFolders', key);
  return boundedFirestore(
    runTransaction(db, async (tx) => {
      const existing = await tx.get(ref);
      if (existing.exists()) return existing.data() as typeof candidate;
      tx.set(ref, candidate);
      return candidate;
    }),
  );
}
