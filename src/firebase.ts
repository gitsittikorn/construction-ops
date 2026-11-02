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
import type { Trip } from './models';
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
export async function syncTrip(owner: string, trip: Trip) {
  if (!app || auth?.currentUser?.uid !== owner) throw Error('กรุณาเข้าสู่ระบบก่อนซิงก์');
  const db = getFirestore(app);
  const ref = doc(db, 'users', owner, 'trips', trip.id);
  await runTransaction(db, async (transaction) => {
    const snapshot = await transaction.get(ref);
    if (snapshot.exists()) {
      const remote = snapshot.data();
      if (remote.revision > trip.revision) throw Error('ข้อมูลบนเซิร์ฟเวอร์ใหม่กว่า กรุณาตรวจสอบ');
      if (remote.revision === trip.revision) {
        for (const key of Object.keys(trip) as (keyof Trip)[])
          if (key !== 'syncStatus' && remote[key] !== trip[key])
            throw Error('ข้อมูลบนเซิร์ฟเวอร์ไม่ตรงกัน กรุณาตรวจสอบ');
        return;
      }
    }
    transaction.set(ref, { ...trip, syncStatus: 'synced', serverUpdatedAt: serverTimestamp() });
    transaction.set(doc(db, 'users', owner, 'audit', `${trip.id}-${trip.revision}`), {
      entityId: trip.id,
      action: 'sync',
      actor: owner,
      revision: trip.revision,
      at: serverTimestamp(),
    });
  });
}
