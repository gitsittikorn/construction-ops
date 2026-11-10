import {
  getMultiFactorResolver,
  GoogleAuthProvider,
  multiFactor,
  reauthenticateWithPopup,
  TotpMultiFactorGenerator,
  type MultiFactorError,
} from 'firebase/auth';
import { sessionAuth } from './firebase';

export type TotpChallenge = {
  factors: { uid: string; name: string }[];
  verify: (factorUid: string, code: string) => Promise<void>;
};
export type TotpSetup = {
  secretKey: string;
  deadline: string;
  finish: (code: string) => Promise<void>;
};
function codeValue(code: string) {
  if (!/^\d{6}$/.test(code.trim())) throw Error('กรอกรหัสยืนยัน 6 หลักจากแอปยืนยันตัวตน');
  return code.trim();
}
function googleUser(expectedUid: string) {
  const user = sessionAuth().currentUser;
  if (
    !user ||
    user.uid !== expectedUid ||
    !user.emailVerified ||
    !user.providerData.some((provider) => provider.providerId === 'google.com')
  )
    throw Error('บัญชีเปลี่ยนหรือยังไม่ได้ยืนยัน Google กรุณาเข้าสู่ระบบใหม่');
  return user;
}
export function totpEnrolled(expectedUid: string) {
  return multiFactor(googleUser(expectedUid)).enrolledFactors.some(
    (factor) => factor.factorId === TotpMultiFactorGenerator.FACTOR_ID,
  );
}
export async function beginTotpSetup(expectedUid: string): Promise<TotpSetup> {
  const user = googleUser(expectedUid);
  // Called directly from the user's button gesture; never start a popup on mount.
  await reauthenticateWithPopup(user, new GoogleAuthProvider());
  googleUser(expectedUid);
  const session = await multiFactor(user).getSession();
  googleUser(expectedUid);
  const secret = await TotpMultiFactorGenerator.generateSecret(session);
  googleUser(expectedUid);
  return {
    secretKey: secret.secretKey,
    deadline: secret.enrollmentCompletionDeadline,
    finish: async (code) => {
      const value = codeValue(code);
      googleUser(expectedUid);
      await multiFactor(user).enroll(
        TotpMultiFactorGenerator.assertionForEnrollment(secret, value),
        'Construction Ops authenticator',
      );
      googleUser(expectedUid);
      await user.getIdToken(true);
    },
  };
}
export function totpChallenge(error: unknown): TotpChallenge {
  const auth = sessionAuth(),
    initialUid = auth.currentUser?.uid ?? null,
    resolver = getMultiFactorResolver(auth, error as MultiFactorError),
    factors = resolver.hints
      .filter((factor) => factor.factorId === TotpMultiFactorGenerator.FACTOR_ID)
      .map((factor, index) => ({
        uid: factor.uid,
        name: factor.displayName || `แอปยืนยันตัวตน ${index + 1}`,
      }));
  if (!factors.length) throw Error('บัญชีนี้ใช้วิธียืนยันอื่น กรุณาติดต่อผู้ดูแลเพื่อกู้บัญชี');
  return {
    factors,
    verify: async (factorUid, code) => {
      const value = codeValue(code);
      if ((auth.currentUser?.uid ?? null) !== initialUid)
        throw Error('บัญชีเปลี่ยน กรุณาเริ่มเข้าสู่ระบบใหม่');
      if (!factors.some((factor) => factor.uid === factorUid)) throw Error('วิธียืนยันไม่ถูกต้อง');
      await resolver.resolveSignIn(TotpMultiFactorGenerator.assertionForSignIn(factorUid, value));
    },
  };
}
export function mfaErrorMessage(error: unknown) {
  const code = error && typeof error === 'object' && 'code' in error ? error.code : '';
  if (code === 'auth/invalid-verification-code')
    return 'รหัสไม่ถูกต้องหรือหมดรอบแล้ว กรุณาใช้รหัสใหม่จากแอป';
  if (code === 'auth/code-expired' || code === 'auth/invalid-multi-factor-session')
    return 'คำขอยืนยันหมดอายุ กรุณายกเลิกแล้วเริ่มใหม่';
  if (code === 'auth/operation-not-allowed' || code === 'auth/unsupported-first-factor')
    return 'ยังไม่ได้เปิด TOTP MFA ใน Firebase Authentication with Identity Platform กรุณาติดต่อผู้ดูแล';
  if (code === 'auth/requires-recent-login') return 'กรุณายืนยัน Google ใหม่ก่อนตั้งค่ารหัส';
  if (code === 'auth/popup-blocked') return 'กรุณาอนุญาตป๊อปอัปเพื่อยืนยัน Google แล้วลองใหม่';
  if (code === 'auth/popup-closed-by-user') return 'ปิดหน้าต่างยืนยันแล้ว กดตั้งค่าเพื่อลองใหม่ได้';
  if (code === 'auth/too-many-requests') return 'ลองยืนยันหลายครั้งเกินไป กรุณารอสักครู่';
  if (error instanceof Error && !code && /^(กรอก|บัญชี|วิธียืนยัน)/.test(error.message))
    return error.message;
  return 'ยืนยันไม่สำเร็จ กรุณาตรวจอินเทอร์เน็ตแล้วลองใหม่ ไม่ได้เปลี่ยนสิทธิ์บริษัท';
}
