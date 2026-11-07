import { emptyData, type Data } from '../models';
import {
  createDaily,
  dailySessions,
  saveDailyRow,
  duplicateNextDay,
  undoDaily,
  verifyDaily,
  closeDaily,
  reopenDaily,
  rowFingerprint,
  verificationState,
  commitWorkspace,
} from '../daily';
import { fixture, project, truck } from './syncFixtures';
import type { DailyRow, EvidenceRecord } from '../workspaceModels';
import type { UploadRecord } from '../uploads';
import { prepareSync, applyRecord, integrityIssues } from '../syncModel';
import { validateCloudRecord } from '../cloudValidation';

const driver = { ...truck, id: 'driver', kind: 'driver' as const, name: 'คนขับ' };
const row: DailyRow = {
  id: 'row',
  truckId: truck.id,
  driverId: driver.id,
  teamId: '',
  sourceId: '',
  soilType: '',
  tripCount: 3,
  capacity: 12,
  reportedTrips: 3,
  notes: '',
};
export function dailyFixture() {
  let data: Data = { ...fixture(), masters: [truck, driver] };
  data = createDaily(data, project.id, '2026-11-06', 'admin');
  const s = dailySessions(data)[0];
  return saveDailyRow(data, s.id, s.body.version, row, 'admin');
}
export function readyEvidence(data: Data) {
  const s = dailySessions(data)[0],
    fingerprint = rowFingerprint(s, s.body.rows[0]);
  const files = (['driver-photo', 'signature', 'trip-slip'] as const).map((category) => ({
    uploadId: category,
    category,
    name: `${category}.png`,
  }));
  const evidence: EvidenceRecord = {
    id: 'evidence',
    recordType: 'evidence',
    projectId: project.id,
    name: 'หลักฐาน',
    createdAt: 'now',
    updatedAt: 'now',
    body: {
      sessionId: s.id,
      rowId: 'row',
      date: s.body.date,
      truckId: truck.id,
      driverId: driver.id,
      fingerprint,
      files,
    },
  };
  const uploads: UploadRecord[] = files.map((f) => ({
    id: f.uploadId,
    owner: 'admin',
    projectId: project.id,
    tripId: '',
    evidenceId: evidence.id,
    driverId: driver.id,
    truckId: truck.id,
    workDate: s.body.date,
    category: f.category,
    name: f.name,
    mimeType: 'image/png',
    size: 10,
    createdAt: 'now',
    status: 'synced',
    driveId: `drive-${f.uploadId}`,
    folderId: 'folder',
    error: '',
  }));
  return { data: commitWorkspace(data, evidence, 'admin', 'evidence-save'), uploads };
}
it('creates stable project/date sessions, rejects invalid dates, duplicate days and trucks', () => {
  const data = dailyFixture(),
    s = dailySessions(data)[0];
  expect(() => createDaily(data, project.id, s.body.date, 'admin')).toThrow('มีอยู่แล้ว');
  expect(() => createDaily(data, project.id, '2026-02-30', 'admin')).toThrow('วันที่');
  expect(() =>
    saveDailyRow(data, s.id, s.body.version, { ...row, id: 'duplicate' }, 'admin'),
  ).toThrow('มีในวัน');
  expect(data.trips).toEqual(fixture().trips);
});
it('uses capacity snapshots, rejects negatives and stale edits, and undoes only the latest explicit edit', () => {
  let data = dailyFixture(),
    s = dailySessions(data)[0];
  data = saveDailyRow(data, s.id, s.body.version, { ...row, tripCount: 4 }, 'admin');
  expect(dailySessions(data)[0].body.rows[0].tripCount * row.capacity).toBe(48);
  expect(() => saveDailyRow(data, s.id, s.body.version, row, 'admin')).toThrow('เปลี่ยน');
  s = dailySessions(data)[0];
  expect(() =>
    saveDailyRow(data, s.id, s.body.version, { ...row, tripCount: -1 }, 'admin'),
  ).toThrow('จำนวนเต็ม');
  data = undoDaily(data, s.id, s.body.version, 'admin');
  expect(dailySessions(data)[0].body.rows[0].tripCount).toBe(3);
  expect(
    dailySessions(data)[0].body.history?.some((entry) =>
      entry.changes.some(
        (change) => change.before?.tripCount === 3 && change.after?.tripCount === 4,
      ),
    ),
  ).toBe(true);
  expect(() => undoDaily(data, s.id, dailySessions(data)[0].body.version, 'admin')).toThrow(
    'ไม่มี',
  );
});
it('copies only work configuration to the next calendar day with zero counts and no evidence or verification', () => {
  const { data } = readyEvidence(dailyFixture()),
    s = dailySessions(data)[0];
  const copied = duplicateNextDay(data, s.id, 'admin'),
    next = dailySessions(copied).find((d) => d.body.date === '2026-11-07')!;
  expect(next.body.rows[0]).toMatchObject({
    truckId: truck.id,
    driverId: driver.id,
    capacity: 12,
    tripCount: 0,
    reportedTrips: null,
  });
  expect(next.body.verifications).toEqual({});
  expect(next.body.closures).toEqual([]);
  expect(copied.workspaces?.filter((r) => r.recordType === 'evidence')).toHaveLength(1);
  expect(() => duplicateNextDay(copied, s.id, 'admin')).toThrow('มีอยู่แล้ว');
});
it('matched is not verified, upload completion alone does not verify, and incomplete/mismatched evidence is rejected', () => {
  const original = dailyFixture(),
    s = dailySessions(original)[0];
  expect(verificationState(s, row)).toBe('MATCHED');
  expect(() => verifyDaily(original, s.id, s.body.version, 'admin', [])).toThrow('หลักฐาน');
  const { data, uploads } = readyEvidence(original);
  expect(verificationState(dailySessions(data)[0], row)).toBe('MATCHED');
  expect(() =>
    verifyDaily(
      data,
      s.id,
      s.body.version,
      'admin',
      uploads.map((u) => ({ ...u, status: 'pending' })),
    ),
  ).toThrow('อัปโหลด');
  expect(() =>
    verifyDaily(
      data,
      s.id,
      s.body.version,
      'admin',
      uploads.map((u) => ({ ...u, truckId: 'different' })),
    ),
  ).toThrow('ตรงกัน');
});
it('closes with an immutable verified snapshot, blocks edits, reopens only with reason and preserves close history', () => {
  let { data, uploads } = readyEvidence(dailyFixture()),
    s = dailySessions(data)[0];
  data = verifyDaily(data, s.id, s.body.version, 'admin', uploads);
  s = dailySessions(data)[0];
  data = closeDaily(data, s.id, s.body.version, 'admin', uploads);
  s = dailySessions(data)[0];
  expect(s.body.closures[0]).toMatchObject({ trips: 3, volume: 36 });
  expect(() => saveDailyRow(data, s.id, s.body.version, { ...row, tripCount: 4 }, 'admin')).toThrow(
    'ปิดวัน',
  );
  expect(() => reopenDaily(data, s.id, s.body.version, 'admin', '')).toThrow('เหตุผล');
  data = reopenDaily(data, s.id, s.body.version, 'admin', 'แก้ใบเที่ยว');
  s = dailySessions(data)[0];
  expect(s.body.verifications).toEqual({});
  expect(s.body.closures[0].volume).toBe(36);
  expect(() => saveDailyRow(data, s.id, s.body.version, row, 'admin')).toThrow('เหตุผล');
  data = saveDailyRow(
    data,
    s.id,
    s.body.version,
    { ...row, tripCount: 4 },
    'admin',
    'ใบเที่ยวเพิ่ม',
  );
  expect(dailySessions(data)[0].body.closures[0].rows[0].tripCount).toBe(3);
});
it('rejects duplicate confirmation and proof that changed after verification', () => {
  let { data, uploads } = readyEvidence(dailyFixture());
  let session = dailySessions(data)[0];
  data = verifyDaily(data, session.id, session.body.version, 'admin', uploads);
  session = dailySessions(data)[0];
  expect(() => verifyDaily(data, session.id, session.body.version, 'admin', uploads)).toThrow(
    'ยืนยันยอดนี้แล้ว',
  );
  expect(() =>
    closeDaily(
      data,
      session.id,
      session.body.version,
      'admin',
      uploads.map((u) => ({ ...u, driveId: `changed-${u.id}` })),
    ),
  ).toThrow('หลักฐานเปลี่ยน');
  expect(() =>
    closeDaily(
      data,
      session.id,
      session.body.version,
      'admin',
      uploads.map((u) => ({ ...u, evidenceId: 'another-evidence' })),
    ),
  ).toThrow('อัปโหลด');
});
it('bulk confirmation preserves rows already verified while confirming the remaining truck', () => {
  let { data, uploads } = readyEvidence(dailyFixture());
  data = { ...data, masters: [...data.masters, { ...truck, id: 'truck2' }] };
  let session = dailySessions(data)[0];
  data = verifyDaily(data, session.id, session.body.version, 'admin', uploads, 'row');
  session = dailySessions(data)[0];
  const original = structuredClone(session.body.verifications.row);
  data = saveDailyRow(
    data,
    session.id,
    session.body.version,
    { ...row, id: 'row2', truckId: 'truck2' },
    'admin',
  );
  session = dailySessions(data)[0];
  const evidence = structuredClone(
    data.workspaces!.find((r) => r.recordType === 'evidence')!,
  ) as EvidenceRecord;
  evidence.id = 'evidence2';
  evidence.body.rowId = 'row2';
  evidence.body.truckId = 'truck2';
  evidence.body.fingerprint = rowFingerprint(
    session,
    session.body.rows.find((r) => r.id === 'row2')!,
  );
  evidence.body.files = evidence.body.files.map((f) => ({ ...f, uploadId: `${f.uploadId}2` }));
  data = commitWorkspace(data, evidence, 'admin', 'evidence-save');
  uploads = [
    ...uploads,
    ...uploads.map((u) => ({
      ...u,
      id: `${u.id}2`,
      evidenceId: 'evidence2',
      truckId: 'truck2',
      driveId: `${u.driveId}2`,
    })),
  ];
  data = verifyDaily(data, session.id, session.body.version, 'admin', uploads);
  session = dailySessions(data)[0];
  expect(session.body.verifications.row).toEqual(original);
  expect(session.body.rows.every((r) => verificationState(session, r) === 'VERIFIED')).toBe(true);
});
it('invalidates manual verification when reported counts change even if recorded trips and evidence context stay identical', () => {
  let { data, uploads } = readyEvidence(dailyFixture());
  let s = dailySessions(data)[0];
  data = verifyDaily(data, s.id, s.body.version, 'admin', uploads);
  s = dailySessions(data)[0];
  expect(verificationState(s, s.body.rows[0])).toBe('VERIFIED');
  data = saveDailyRow(
    data,
    s.id,
    s.body.version,
    { ...s.body.rows[0], reportedTrips: 4 },
    'admin',
    'แก้ใบเที่ยว',
  );
  s = dailySessions(data)[0];
  expect(s.body.verifications).toEqual({});
  expect(verificationState(s, s.body.rows[0])).toBe('MISMATCHED');
  expect(() => closeDaily(data, s.id, s.body.version, 'admin', uploads)).toThrow('ยืนยัน');
});
it('syncs daily/evidence through the existing envelope and validates relationships', () => {
  const { data } = readyEvidence(dailyFixture()),
    prepared = prepareSync(data, data);
  const entries = Object.entries(prepared.sync!.entries).filter(([key]) =>
    key.startsWith('workspaces/'),
  );
  expect(entries).toHaveLength(2);
  for (const [, entry] of entries) validateCloudRecord('workspaces', entry.desired);
  let restored = { ...emptyData, projects: [project], masters: [truck, driver] };
  for (const [, entry] of entries)
    restored = applyRecord(restored, 'workspaces', entry.desired, true);
  expect(dailySessions(restored)).toHaveLength(1);
  expect(integrityIssues(restored)).toEqual([]);
  expect(integrityIssues({ ...restored, masters: [] })).not.toEqual([]);
});
import { correctDailyTrip, dailyRowVolume, summarizeDaily } from '../daily';
import { emptyReportFilter, reportRows } from '../reports';
import { validateWorkspace } from '../workspaceValidation';

it('preserves per-trip capacities, creates unique IDs and recalculates correction in summaries and reports', () => {
  let data = dailyFixture();
  let session = dailySessions(data)[0];
  const before = structuredClone(session.body.rows[0].transactions!);
  data = saveDailyRow(
    data,
    session.id,
    session.body.version,
    { ...session.body.rows[0], tripCount: 4, capacity: 20 },
    'admin',
  );
  session = dailySessions(data)[0];
  const row = session.body.rows[0];
  expect(row.transactions!.slice(0, 3)).toEqual(before);
  expect(new Set(row.transactions!.map((t) => t.id)).size).toBe(4);
  expect(dailyRowVolume(row)).toBe(56);
  expect(() =>
    correctDailyTrip(data, session.id, session.body.version, row.id, before[0].id, 10, 'admin', ''),
  ).toThrow('เหตุผล');
  data = correctDailyTrip(
    data,
    session.id,
    session.body.version,
    row.id,
    before[0].id,
    10,
    'admin',
    'แก้ความจุ',
  );
  session = dailySessions(data)[0];
  expect(summarizeDaily(session).byTruck[0].volume).toBe(54);
  expect(session.body.history!.at(-1)!.tripChanges![0]).toMatchObject({
    tripId: before[0].id,
    before: { capacity: 12 },
    after: { capacity: 10 },
  });
  expect(session.body.history!.at(-1)!.changes[0].before!.transactions).toBeUndefined();
  expect(
    reportRows(data, emptyReportFilter)
      .filter((r) => r.id.startsWith(`${session.id}:${row.id}:`))
      .reduce((sum, r) => sum + (r.volume ?? 0), 0),
  ).toBe(54);
  expect(() => validateWorkspace(session)).not.toThrow();
  expect(() =>
    correctDailyTrip(
      data,
      session.id,
      session.body.version,
      row.id,
      before[0].id,
      -1,
      'admin',
      'ผิด',
    ),
  ).toThrow('รายเที่ยว');
  expect(() =>
    correctDailyTrip(data, session.id, session.body.version, row.id, 'missing', 10, 'admin', 'ผิด'),
  ).toThrow('ไม่พบ');
  const copied = duplicateNextDay(data, session.id, 'admin');
  expect(dailySessions(copied)[1].body.rows[0].transactions).toEqual([]);
  expect(dailySessions(copied)[0]).toEqual(session);
});

it('migrates aggregate rows only on edit without replacing the old audit snapshot', () => {
  let data = dailyFixture();
  let session = dailySessions(data)[0];
  delete session.body.rows[0].transactions;
  data = saveDailyRow(
    data,
    session.id,
    session.body.version,
    { ...session.body.rows[0], tripCount: 4, capacity: 20 },
    'admin',
  );
  session = dailySessions(data)[0];
  expect(session.body.rows[0].transactions!.filter((t) => t.id.startsWith('legacy-'))).toHaveLength(
    3,
  );
  expect(dailyRowVolume(session.body.rows[0])).toBe(56);
  expect((data.audit.at(-1)!.before as typeof session).body.rows[0].transactions).toBeUndefined();
});

it('rejects counts above the transaction limit without losing existing legacy aggregates', () => {
  const data = dailyFixture();
  const session = dailySessions(data)[0];
  expect(() =>
    saveDailyRow(
      data,
      session.id,
      session.body.version,
      { ...session.body.rows[0], tripCount: 5001 },
      'admin',
    ),
  ).toThrow('5,000');
  delete session.body.rows[0].transactions;
  session.body.rows[0].tripCount = 5001;
  expect(() =>
    saveDailyRow(
      data,
      session.id,
      session.body.version,
      { ...session.body.rows[0], capacity: 13 },
      'admin',
    ),
  ).toThrow('5,000');
  expect(dailyRowVolume(session.body.rows[0])).toBe(60012);
});

it('rejects foreign owners, missing folders, duplicate Drive IDs and mismatched evidence context before verification or closure', () => {
  const ready = readyEvidence(dailyFixture());
  const session = dailySessions(ready.data)[0];
  for (const uploads of [
    ready.uploads.map((file) => ({ ...file, owner: 'another-owner' })),
    ready.uploads.map((file) => ({ ...file, folderId: '' })),
    ready.uploads.map((file) => ({ ...file, driveId: 'one-file-for-all-categories' })),
  ]) {
    expect(() =>
      verifyDaily(ready.data, session.id, session.body.version, 'admin', uploads),
    ).toThrow();
    const verified = verifyDaily(
      ready.data,
      session.id,
      session.body.version,
      'admin',
      ready.uploads,
    );
    const current = dailySessions(verified)[0];
    expect(() =>
      closeDaily(verified, current.id, current.body.version, 'admin', uploads),
    ).toThrow();
    expect(current.body.state).toBe('open');
    expect(current.body.closures).toEqual([]);
  }
  for (const field of ['projectId', 'date', 'truckId', 'driverId'] as const) {
    const data = structuredClone(ready.data);
    const evidence = data.workspaces!.find(
      (record) => record.recordType === 'evidence',
    )! as EvidenceRecord;
    if (field === 'projectId') evidence.projectId = 'other-project';
    else evidence.body[field] = 'other-context';
    expect(() =>
      verifyDaily(data, session.id, session.body.version, 'admin', ready.uploads),
    ).toThrow('ตรงกัน');
  }
  expect(session.body.verifications).toEqual({});
});

it('requires reasons for reducing recorded trips or changing an existing reported total, while normal increments stay fast', () => {
  let data = dailyFixture();
  let session = dailySessions(data)[0];
  const initial = structuredClone(data);
  for (const row of [
    { ...session.body.rows[0], tripCount: 2 },
    { ...session.body.rows[0], reportedTrips: 2 },
    { ...session.body.rows[0], reportedTrips: null },
  ]) {
    expect(() => saveDailyRow(data, session.id, session.body.version, row, 'admin')).toThrow(
      'เหตุผล',
    );
    expect(data).toEqual(initial);
  }
  data = saveDailyRow(
    data,
    session.id,
    session.body.version,
    { ...session.body.rows[0], tripCount: 4 },
    'admin',
  );
  session = dailySessions(data)[0];
  data = saveDailyRow(
    data,
    session.id,
    session.body.version,
    { ...session.body.rows[0], tripCount: 2, reportedTrips: 2 },
    'admin',
    'ตัดเที่ยวที่บันทึกซ้ำ',
  );
  expect(dailySessions(data)[0].body.history!.at(-1)).toMatchObject({
    reason: 'ตัดเที่ยวที่บันทึกซ้ำ',
    by: 'admin',
  });
  expect(dailySessions(data)[0].body.rows[0].tripCount).toBe(2);
});
