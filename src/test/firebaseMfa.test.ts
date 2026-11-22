import { beginTotpSetup, totpChallenge, totpEnrolled, mfaErrorMessage } from '../firebaseMfa';
const state = vi.hoisted(() => ({
  auth: {
    currentUser: null as null | {
      uid: string;
      emailVerified: boolean;
      providerData: { providerId: string }[];
      getIdToken: ReturnType<typeof vi.fn>;
    },
  },
  enrolledFactors: [{ uid: 'factor', factorId: 'totp', displayName: 'My authenticator' }],
  reauthenticate: vi.fn(),
  getSession: vi.fn(),
  generateSecret: vi.fn(),
  enroll: vi.fn(),
  resolveSignIn: vi.fn(),
}));
vi.mock('../firebase', () => ({ sessionAuth: () => state.auth }));
vi.mock('firebase/auth', () => ({
  GoogleAuthProvider: class {},
  reauthenticateWithPopup: state.reauthenticate,
  multiFactor: () => ({
    enrolledFactors: state.enrolledFactors,
    getSession: state.getSession,
    enroll: state.enroll,
  }),
  getMultiFactorResolver: () => ({
    hints: state.enrolledFactors,
    resolveSignIn: state.resolveSignIn,
  }),
  TotpMultiFactorGenerator: {
    FACTOR_ID: 'totp',
    generateSecret: state.generateSecret,
    assertionForEnrollment: (secret: unknown, code: string) => ({ secret, code }),
    assertionForSignIn: (uid: string, code: string) => ({ uid, code }),
  },
}));
beforeEach(() => {
  state.auth.currentUser = {
    uid: 'actor',
    emailVerified: true,
    providerData: [{ providerId: 'google.com' }],
    getIdToken: vi.fn().mockResolvedValue('synthetic-token'),
  };
  state.enrolledFactors = [{ uid: 'factor', factorId: 'totp', displayName: 'My authenticator' }];
  state.reauthenticate.mockReset().mockResolvedValue(undefined);
  state.getSession.mockReset().mockResolvedValue({ session: 'synthetic-session' });
  state.generateSecret.mockReset().mockResolvedValue({
    secretKey: 'TEST_ONLY_SETUP_KEY',
    enrollmentCompletionDeadline: '2026-11-10T12:00:00Z',
  });
  state.enroll.mockReset().mockResolvedValue(undefined);
  state.resolveSignIn.mockReset().mockResolvedValue(undefined);
});
it('requires the selected verified Google account for enrollment', async () => {
  expect(totpEnrolled('actor')).toBe(true);
  await expect(beginTotpSetup('other')).rejects.toThrow('บัญชีเปลี่ยน');
  state.auth.currentUser!.emailVerified = false;
  await expect(beginTotpSetup('actor')).rejects.toThrow('ยืนยัน Google');
  state.auth.currentUser!.emailVerified = true;
  state.auth.currentUser!.providerData = [{ providerId: 'password' }];
  await expect(beginTotpSetup('actor')).rejects.toThrow('ยืนยัน Google');
  expect(state.reauthenticate).not.toHaveBeenCalled();
});
it('reauthenticates before generating a key and enrolls only after a valid confirmation', async () => {
  const setup = await beginTotpSetup('actor');
  expect(state.reauthenticate).toHaveBeenCalledOnce();
  expect(state.generateSecret).toHaveBeenCalledWith({ session: 'synthetic-session' });
  expect(state.enroll).not.toHaveBeenCalled();
  await expect(setup.finish('123')).rejects.toThrow('6 หลัก');
  expect(state.enroll).not.toHaveBeenCalled();
  await setup.finish('012345');
  expect(state.enroll).toHaveBeenCalledWith(
    expect.objectContaining({ code: '012345' }),
    'Construction Ops authenticator',
  );
  expect(state.auth.currentUser!.getIdToken).toHaveBeenCalledWith(true);
});
it('discards a delayed secret and rejects confirmation after an account switch', async () => {
  const setup = await beginTotpSetup('actor');
  state.generateSecret.mockImplementationOnce(async () => {
    state.auth.currentUser = null;
    return { secretKey: 'TEST_ONLY_SETUP_KEY' };
  });
  await expect(beginTotpSetup('actor')).rejects.toThrow('บัญชีเปลี่ยน');
  await expect(setup.finish('012345')).rejects.toThrow('บัญชีเปลี่ยน');
  expect(state.enroll).not.toHaveBeenCalled();
});
it('allows only an offered TOTP factor and rejects stale-account challenges', async () => {
  state.auth.currentUser = null;
  const challenge = totpChallenge({ code: 'auth/multi-factor-auth-required' });
  await expect(challenge.verify('forged', '012345')).rejects.toThrow('วิธียืนยัน');
  await expect(challenge.verify('factor', 'abcdef')).rejects.toThrow('6 หลัก');
  expect(state.resolveSignIn).not.toHaveBeenCalled();
  await challenge.verify('factor', '012345');
  expect(state.resolveSignIn).toHaveBeenCalledWith({ uid: 'factor', code: '012345' });
  state.auth.currentUser = {
    uid: 'other',
    emailVerified: true,
    providerData: [],
    getIdToken: vi.fn(),
  };
  await expect(challenge.verify('factor', '012345')).rejects.toThrow('บัญชีเปลี่ยน');
  expect(state.resolveSignIn).toHaveBeenCalledTimes(1);
});
it('fails safely for unsupported enrolled factors and provider details', () => {
  state.enrolledFactors = [{ uid: 'phone', factorId: 'phone', displayName: 'Private number' }];
  expect(() => totpChallenge({})).toThrow('วิธียืนยันอื่น');
  expect(mfaErrorMessage({ code: 'auth/operation-not-allowed' })).toContain('Identity Platform');
  expect(mfaErrorMessage({ code: 'auth/invalid-verification-code' })).toContain('รหัสไม่ถูกต้อง');
  expect(mfaErrorMessage({ code: 'auth/invalid-multi-factor-session' })).toContain('หมดอายุ');
  expect(mfaErrorMessage(Error('private provider response'))).not.toContain('private');
});
