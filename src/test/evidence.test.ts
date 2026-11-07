import { webcrypto } from 'node:crypto';
import { File as NodeFile } from 'node:buffer';
import { saveEvidence, evidenceStatus, storageWarning } from '../evidence';
import { createDaily, dailySessions, saveDailyRow } from '../daily';
import { fixture, project, truck } from './syncFixtures';
import {
  persistData,
  loadData,
  updateData,
  updateDataAndUploads,
  openLocalDatabase,
} from '../storage';
import { listUploads } from '../uploads';
import { readBlobBytes } from '../files';
import { verifyDaily, closeDaily, verificationState } from '../daily';
import { putUpload } from '../uploads';
import { validateWorkspace } from '../workspaceValidation';

beforeEach(() => vi.stubGlobal('crypto', webcrypto));
afterEach(() => vi.unstubAllGlobals());
async function setup() {
  const owner = crypto.randomUUID(),
    driver = { ...truck, id: 'driver', kind: 'driver' as const };
  await persistData(owner, { ...fixture(), masters: [truck, driver] });
  await updateData(owner, (data) => createDaily(data, project.id, '2026-11-06', owner));
  const s = dailySessions(await loadData(owner))[0];
  await updateData(owner, (data) =>
    saveDailyRow(
      data,
      s.id,
      1,
      {
        id: 'row',
        truckId: truck.id,
        driverId: 'driver',
        teamId: '',
        sourceId: '',
        soilType: '',
        tripCount: 3,
        capacity: 12,
        reportedTrips: 3,
        notes: '',
      },
      owner,
    ),
  );
  return { owner, id: s.id };
}
const image = () =>
  new NodeFile(['original photo bytes'], 'photo.png', { type: 'image/png' }) as unknown as File;
it('stores original bytes and evidence atomically, uses stable content IDs and survives reopening', async () => {
  const { owner, id } = await setup();
  await saveEvidence(owner, id, 'row', 'driver-photo', [image()]);
  await saveEvidence(owner, id, 'row', 'driver-photo', [image()]);
  const files = await listUploads(owner);
  expect(files).toHaveLength(1);
  expect(files[0].id.length).toBeLessThan(100);
  expect(files[0].status).toBe('pending');
  expect(new TextDecoder().decode(await readBlobBytes(files[0].blob!))).toBe(
    'original photo bytes',
  );
  expect(
    (await loadData(owner)).workspaces?.filter((r) => r.recordType === 'evidence'),
  ).toHaveLength(1);
  const db = await openLocalDatabase();
  expect(await db.get('state', ['v4-backup', owner])).toBeDefined();
  db.close();
});
it('keeps all old proof but starts new context after count changes and rejects unsupported/missing-driver evidence', async () => {
  const { owner, id } = await setup();
  await saveEvidence(owner, id, 'row', 'driver-photo', [image()]);
  await updateData(owner, (data) => {
    const s = dailySessions(data)[0];
    return saveDailyRow(data, id, s.body.version, { ...s.body.rows[0], tripCount: 4 }, owner);
  });
  await saveEvidence(owner, id, 'row', 'driver-photo', [image()]);
  expect(await listUploads(owner)).toHaveLength(2);
  await expect(
    saveEvidence(owner, id, 'row', 'signature', [
      new NodeFile(['x'], 'bad.pdf', { type: 'application/pdf' }) as unknown as File,
    ]),
  ).rejects.toThrow('รูปภาพ');
  await expect(saveEvidence(owner, id, 'row', 'signature', [])).rejects.toThrow('เลือก');
  await expect(saveEvidence(owner, id, 'missing', 'signature', [image()])).rejects.toThrow('คนขับ');
});
it('aborts both records and files when a domain mutation fails, without clearing previous data', async () => {
  const { owner } = await setup();
  const before = await loadData(owner);
  await expect(
    updateDataAndUploads(owner, [{ id: 'bad', owner, evidenceId: 'e', size: 1 } as never], () => {
      throw Error('changed context');
    }),
  ).rejects.toThrow('context');
  expect(await loadData(owner)).toEqual(before);
  expect(await listUploads(owner)).toEqual([]);
  await expect(
    updateDataAndUploads(owner, [{ owner: 'other' } as never], (data) => data),
  ).rejects.toThrow('บัญชี');
});
it('separates upload completion from evidence verification and warns before storage is full', async () => {
  const { owner, id } = await setup();
  await saveEvidence(owner, id, 'row', 'driver-photo', [image()]);
  const file = (await listUploads(owner))[0];
  expect(evidenceStatus([file], false)).toBe('INCOMPLETE');
  const files = (['driver-photo', 'signature', 'trip-slip'] as const).map((category) => ({
    ...file,
    category,
  }));
  expect(evidenceStatus(files, false)).toBe('READY');
  expect(
    evidenceStatus(
      files.map((f) => ({ ...f, status: 'synced', driveId: 'drive' })),
      false,
    ),
  ).toBe('UPLOADED');
  expect(evidenceStatus(files, true)).toBe('VERIFIED');
  expect(evidenceStatus([{ ...file, status: 'error' }], false)).toBe('FAILED');
  const descriptor = Object.getOwnPropertyDescriptor(navigator, 'storage');
  Object.defineProperty(navigator, 'storage', {
    value: { estimate: async () => ({ quota: 100, usage: 90 }) },
    configurable: true,
  });
  try {
    expect(await storageWarning()).toContain('ใกล้เต็ม');
  } finally {
    if (descriptor) Object.defineProperty(navigator, 'storage', descriptor);
    else delete (navigator as unknown as Record<string, unknown>).storage;
  }
});

it('records the signer and time, replaces proof safely and invalidates previous confirmation', async () => {
  const { owner, id } = await setup();
  for (const category of ['driver-photo', 'signature', 'trip-slip'] as const)
    await saveEvidence(owner, id, 'row', category, [image()]);
  let data = await loadData(owner);
  const evidence = data.workspaces!.find((r) => r.recordType === 'evidence')!;
  if (evidence.recordType !== 'evidence') throw Error('fixture');
  expect(evidence.body.signature).toMatchObject({ signerId: 'driver' });
  expect(Number.isFinite(Date.parse(evidence.body.signature!.signedAt))).toBe(true);
  expect(() => validateWorkspace(evidence)).not.toThrow();
  expect(() =>
    validateWorkspace({
      ...evidence,
      body: { ...evidence.body, signature: { ...evidence.body.signature!, signerId: 'wrong' } },
    }),
  ).toThrow('ลายเซ็น');
  for (const file of await listUploads(owner))
    await putUpload({ ...file, status: 'synced', driveId: `test-${file.id}` });
  const uploads = await listUploads(owner);
  await updateData(owner, (data) => {
    const s = dailySessions(data)[0];
    return verifyDaily(data, id, s.body.version, owner, uploads);
  });
  const confirmed = await loadData(owner);
  await saveEvidence(owner, id, 'row', 'driver-photo', [image()]);
  expect((await loadData(owner)).audit).toEqual(confirmed.audit);
  await saveEvidence(owner, id, 'row', 'driver-photo', [
    new NodeFile(['replacement'], 'replacement.png', { type: 'image/png' }) as unknown as File,
  ]);
  data = await loadData(owner);
  const session = dailySessions(data)[0];
  expect(verificationState(session, session.body.rows[0])).toBe('MATCHED');
  expect(() => closeDaily(data, id, session.body.version, owner, uploads)).toThrow('ยืนยัน');
  expect(data.audit.some((a) => a.action === 'evidence-replace')).toBe(true);
  expect(await listUploads(owner)).toHaveLength(4);
});
