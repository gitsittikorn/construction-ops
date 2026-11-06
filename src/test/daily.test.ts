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
it('invalidates manual verification when reported counts change even if recorded trips and evidence context stay identical',()=>{
  let {data,uploads}=readyEvidence(dailyFixture());let s=dailySessions(data)[0];data=verifyDaily(data,s.id,s.body.version,'admin',uploads);s=dailySessions(data)[0];expect(verificationState(s,s.body.rows[0])).toBe('VERIFIED');data=saveDailyRow(data,s.id,s.body.version,{...s.body.rows[0],reportedTrips:4},'admin');s=dailySessions(data)[0];expect(s.body.verifications).toEqual({});expect(verificationState(s,s.body.rows[0])).toBe('MISMATCHED');expect(()=>closeDaily(data,s.id,s.body.version,'admin',uploads)).toThrow('ยืนยัน');
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
