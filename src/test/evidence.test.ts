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
    await putUpload({
      ...file,
      status: 'synced',
      driveId: `test-${file.id}`,
      folderId: 'test-private-folder',
    });
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

it('starts a fresh proof after reopen while keeping all sealed evidence and original bytes unchanged', async () => {
  const { reopenDaily, evidenceFor } = await import('../daily');
  const { owner, id } = await setup();
  for (const category of ['driver-photo', 'signature', 'trip-slip'] as const)
    await saveEvidence(owner, id, 'row', category, [image()]);
  for (const file of await listUploads(owner))
    await putUpload({ ...file, status: 'synced', driveId: `drive-${file.id}`, folderId: 'folder' });
  const uploads = await listUploads(owner);
  await updateData(owner, (data) => {
    const day = dailySessions(data)[0];
    return verifyDaily(data, id, day.body.version, owner, uploads);
  });
  await updateData(owner, (data) => {
    const day = dailySessions(data)[0];
    return closeDaily(data, id, day.body.version, owner, uploads);
  });
  const closed = await loadData(owner),
    oldDay = dailySessions(closed)[0],
    old = evidenceFor(closed, oldDay, oldDay.body.rows[0]).at(-1)!;
  await updateData(owner, (data) => {
    const day = dailySessions(data)[0];
    return reopenDaily(data, id, day.body.version, owner, 'fresh review');
  });
  let latest = await loadData(owner),
    day = dailySessions(latest)[0];
  expect(evidenceFor(latest, day, day.body.rows[0])).toEqual([]);
  await saveEvidence(owner, id, 'row', 'driver-photo', [image()]);
  latest = await loadData(owner);
  day = dailySessions(latest)[0];
  const fresh = evidenceFor(latest, day, day.body.rows[0]).at(-1)!;
  expect(fresh.id).not.toBe(old.id);
  expect(fresh).toMatchObject({ body: { closureGeneration: 1 } });
  expect(latest.workspaces!.find((record) => record.id === old.id)).toEqual(old);
  expect(day.body.closures).toEqual(oldDay.body.closures);
  expect(await listUploads(owner)).toHaveLength(4);
  for (const file of uploads)
    expect(
      new TextDecoder().decode(
        await readBlobBytes(
          (await listUploads(owner)).find((item) => item.id === file.id)!.blob ?? file.blob!,
        ),
      ),
    ).toBe('original photo bytes');
});
it('combines proof categories from different company members instead of creating disconnected evidence records', async () => {
  const { cacheOwner } = await import('../workspaceIdentity');
  const { owner: company, id } = await setup();
  const first = cacheOwner({ companyId: company, actorUid: 'first-member', role: 'operator' }),
    second = cacheOwner({ companyId: company, actorUid: 'second-member', role: 'operator' });
  await persistData(first, await loadData(company));
  await saveEvidence(first, id, 'row', 'driver-photo', [image()]);
  const before = await loadData(first),
    original = before.workspaces!.find((record) => record.recordType === 'evidence')!;
  await persistData(second, before);
  await saveEvidence(second, id, 'row', 'signature', [image()]);
  const evidence = (await loadData(second)).workspaces!.filter(
    (record) => record.recordType === 'evidence',
  );
  expect(evidence).toHaveLength(1);
  expect(evidence[0].id).toBe(original.id);
  if (evidence[0].recordType !== 'evidence') throw Error('fixture');
  expect(evidence[0].body.files.map((file) => file.category).sort()).toEqual([
    'driver-photo',
    'signature',
  ]);
  expect(await listUploads(first)).toHaveLength(1);
  expect(await listUploads(second)).toHaveLength(1);
});
it('rejects invalid proof generations and protects already verified proof from operator replacements', async () => {
  const { cacheOwner } = await import('../workspaceIdentity');
  const { owner: company, id } = await setup();
  const owner = cacheOwner({ companyId: company, actorUid: 'operator', role: 'operator' });
  await persistData(owner, await loadData(company));
  await saveEvidence(owner, id, 'row', 'driver-photo', [image()]);
  const data = await loadData(owner),
    evidence = data.workspaces!.find((record) => record.recordType === 'evidence')!;
  if (evidence.recordType !== 'evidence') throw Error('fixture');
  for (const generation of [-1, 0.5, '1', 101])
    expect(() =>
      validateWorkspace({ ...evidence, body: { ...evidence.body, closureGeneration: generation } }),
    ).toThrow('รุ่นหลักฐาน');
  const day = dailySessions(data)[0];
  day.body.verifications.row = {
    fingerprint: evidence.body.fingerprint,
    evidenceId: evidence.id,
    fileIds: ['file'],
    by: 'manager',
    at: new Date().toISOString(),
  };
  await persistData(owner, data);
  await expect(
    saveEvidence(owner, id, 'row', 'driver-photo', [
      new NodeFile(['replacement'], 'new.png', { type: 'image/png' }) as unknown as File,
    ]),
  ).rejects.toThrow('ผู้จัดการ');
  expect(await loadData(owner)).toEqual(data);
  expect(await listUploads(owner)).toHaveLength(1);
});
