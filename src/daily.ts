import type { Data } from './models';
import type { DailySession, DailyRow, Verification } from './workspaceModels';
import type { UploadRecord } from './uploads';
import { canonical } from './syncModel';

export function validDate(value: string) {
  return (
    /^\d{4}-\d{2}-\d{2}$/.test(value) &&
    Number.isFinite(Date.parse(value)) &&
    new Date(value).toISOString().slice(0, 10) === value
  );
}
export const sessionId = (projectId: string, date: string) => `daily-${projectId}-${date}`;
export function dailySessions(data: Data) {
  return (data.workspaces ?? []).filter(
    (record): record is DailySession => record.recordType === 'daily',
  );
}
export function summarizeDaily(session: DailySession) {
  const group = (key: 'truckId' | 'driverId' | 'sourceId') => {
    const values = new Map<string, { id: string; trips: number; volume: number }>();
    for (const row of session.body.rows) {
      const previous = values.get(row[key]) ?? { id: row[key], trips: 0, volume: 0 };
      previous.trips += row.tripCount;
      previous.volume += dailyRowVolume(row);
      values.set(row[key], previous);
    }
    return [...values.values()];
  };
  return { byTruck: group('truckId'), byDriver: group('driverId'), bySource: group('sourceId') };
}
export function dailyRowVolume(row: DailyRow) {
  return row.trips
    ? row.trips.reduce((sum, trip) => sum + trip.capacity, 0)
    : row.tripCount * row.capacity;
}
export function rowFingerprint(session: DailySession, row: DailyRow) {
  return canonical({
    projectId: session.projectId,
    date: session.body.date,
    truckId: row.truckId,
    driverId: row.driverId,
    teamId: row.teamId,
    sourceId: row.sourceId,
    soilType: row.soilType,
    tripCount: row.tripCount,
    capacity: row.capacity,
    notes: row.notes,
    ...(row.trips ? { trips: row.trips } : {}),
  });
}
export function validateDaily(data: Data, session: DailySession) {
  if (session.body.rows.length > 200 || session.body.closures.length > 100)
    throw Error('เกินขอบเขต 200 คันหรือประวัติปิดวัน 100 ครั้งต่อวัน');
  if (!validDate(session.body.date)) throw Error('วันที่ทำงานไม่ถูกต้อง');
  if (session.id !== sessionId(session.projectId, session.body.date))
    throw Error('รหัสวันทำงานไม่ตรงกัน');
  if (!data.projects.some((p) => p.id === session.projectId)) throw Error('ไม่พบโครงการ');
  const trucks = new Set<string>();
  for (const row of session.body.rows) {
    if (
      row.trips &&
      (row.trips.length !== row.tripCount ||
        new Set(row.trips.map((t) => t.id)).size !== row.trips.length ||
        row.trips.some(
          (t) =>
            !t.id ||
            !Number.isFinite(t.capacity) ||
            t.capacity <= 0 ||
            !Number.isFinite(Date.parse(t.recordedAt)),
        ))
    )
      throw Error('ข้อมูลรายเที่ยวไม่ถูกต้อง');
    if (trucks.has(row.truckId)) throw Error('รถคันนี้มีในวันทำงานแล้ว');
    trucks.add(row.truckId);
    if (
      !Number.isSafeInteger(row.tripCount) ||
      row.tripCount < 0 ||
      row.tripCount > 1000000 ||
      !Number.isFinite(row.capacity) ||
      row.capacity <= 0 ||
      !Number.isFinite(row.tripCount * row.capacity)
    )
      throw Error('เที่ยวต้องเป็นจำนวนเต็มตั้งแต่ศูนย์ และความจุต้องมากกว่าศูนย์');
    if (
      row.reportedTrips !== null &&
      (!Number.isSafeInteger(row.reportedTrips) || row.reportedTrips < 0)
    )
      throw Error('ยอดรายงานต้องเป็นจำนวนเต็มตั้งแต่ศูนย์');
    for (const [id, kind] of [
      [row.truckId, 'truck'],
      [row.driverId, 'driver'],
      [row.teamId, 'tag'],
      [row.sourceId, 'source'],
    ])
      if ((id || kind === 'truck') && !data.masters.some((m) => m.id === id && m.kind === kind))
        throw Error(`ไม่พบข้อมูล ${kind}`);
  }
}
export function commitWorkspace(
  data: Data,
  record: NonNullable<Data['workspaces']>[number],
  actor: string,
  action: string,
): Data {
  if (new TextEncoder().encode(JSON.stringify(record)).byteLength > 750000)
    throw Error('ข้อมูลชุดนี้ใหญ่เกินขอบเขต Cloud กรุณาแยกงานก่อนบันทึก ข้อมูลเดิมยังอยู่');
  const before = (data.workspaces ?? []).find((r) => r.id === record.id) ?? null;
  return {
    ...data,
    workspaces: [...(data.workspaces ?? []).filter((r) => r.id !== record.id), record],
    audit: [
      ...data.audit,
      {
        id: crypto.randomUUID(),
        entityId: record.id,
        action,
        at: record.updatedAt,
        actor,
        before,
        after: structuredClone(record),
      },
    ],
  };
}
export function createDaily(data: Data, projectId: string, date: string, actor: string): Data {
  if (!data.projects.some((p) => p.id === projectId && p.status === 'active'))
    throw Error('เลือกโครงการที่กำลังดำเนินการ');
  if (!validDate(date)) throw Error('วันที่ทำงานไม่ถูกต้อง');
  const id = sessionId(projectId, date);
  if (
    (data.workspaces ?? []).some((r) => r.id === id) ||
    (data.deletedWorkspaces ?? []).some((r) => r.id === id)
  )
    throw Error('วันทำงานนี้มีอยู่แล้ว กรุณาเปิดรายการเดิม');
  const now = new Date().toISOString();
  return commitWorkspace(
    data,
    {
      id,
      projectId,
      name: `งานประจำวันที่ ${date}`,
      recordType: 'daily',
      createdAt: now,
      updatedAt: now,
      body: {
        date,
        version: 1,
        state: 'open',
        rows: [],
        verifications: {},
        closures: [],
        reason: '',
      },
    },
    actor,
    'daily-create',
  );
}
export function updateDaily(
  data: Data,
  id: string,
  version: number,
  actor: string,
  action: string,
  edit: (session: DailySession) => void,
  reason = '',
): Data {
  const old = dailySessions(data).find((s) => s.id === id);
  if (!old || old.body.version !== version) throw Error('ข้อมูลเปลี่ยนแล้ว กรุณาเปิดวันทำงานใหม่');
  if (old.body.state === 'closed' && action !== 'daily-reopen')
    throw Error('ปิดวันแล้ว ต้องเปิดวันใหม่พร้อมเหตุผลก่อนแก้ไข');
  if ((old.body.state === 'reopened' || action === 'daily-reopen') && !reason.trim())
    throw Error('กรุณาระบุเหตุผลการแก้ไขหรือเปิดวันใหม่');
  const next = structuredClone(old);
  edit(next);
  next.body.version++;
  next.body.reason = reason.trim();
  next.updatedAt = new Date().toISOString();
  const ids = new Set([...old.body.rows, ...next.body.rows].map((row) => row.id));
  const changes = [...ids]
    .map((rowId) => ({
      rowId,
      before: old.body.rows.find((r) => r.id === rowId) ?? null,
      after: next.body.rows.find((r) => r.id === rowId) ?? null,
    }))
    .filter((change) => canonical(change.before) !== canonical(change.after));
  const tripChanges = changes.flatMap(({ rowId, before, after }) => {
    const beforeTrips = new Map(before?.trips?.map((trip) => [trip.id, trip]));
    const afterTrips = new Map(after?.trips?.map((trip) => [trip.id, trip]));
    return [...new Set([...beforeTrips.keys(), ...afterTrips.keys()])]
      .map((tripId) => ({
        rowId,
        tripId,
        before: beforeTrips.get(tripId) ?? null,
        after: afterTrips.get(tripId) ?? null,
      }))
      .filter((change) => canonical(change.before) !== canonical(change.after));
  });
  const summary = (row: DailyRow | null) => {
    if (!row) return null;
    const value = { ...row };
    delete value.trips;
    return value;
  };
  next.body.history = [
    ...(old.body.history ?? []),
    {
      id: crypto.randomUUID(),
      action,
      reason: reason.trim(),
      at: next.updatedAt,
      by: actor,
      changes: changes.map((change) => ({
        rowId: change.rowId,
        before: summary(change.before),
        after: summary(change.after),
      })),
      tripChanges: structuredClone(tripChanges),
    },
  ];
  validateDaily(data, next);
  for (const row of next.body.rows)
    if (
      next.body.verifications[row.id]?.fingerprint !== rowFingerprint(next, row) ||
      row.reportedTrips !== row.tripCount
    )
      delete next.body.verifications[row.id];
  return commitWorkspace(data, next, actor, action);
}
export function saveDailyRow(
  data: Data,
  id: string,
  version: number,
  row: DailyRow,
  actor: string,
  reason = '',
) {
  const previous = dailySessions(data)
    .find((s) => s.id === id)
    ?.body.rows.find((r) => r.id === row.id);
  if (!Number.isSafeInteger(row.tripCount) || row.tripCount < 0)
    throw Error('เที่ยวต้องเป็นจำนวนเต็มตั้งแต่ศูนย์');
  if (row.tripCount <= 1000 && Number.isSafeInteger(row.tripCount) && row.tripCount >= 0) {
    const at = new Date().toISOString();
    const trips = previous?.trips
      ? structuredClone(previous.trips)
      : Array.from({ length: Math.min(previous?.tripCount ?? 0, row.tripCount) }, () => ({
          id: crypto.randomUUID(),
          capacity: previous!.capacity,
          recordedAt: at,
          migrated: true,
        }));
    trips.length = Math.min(trips.length, row.tripCount);
    while (trips.length < row.tripCount)
      trips.push({ id: crypto.randomUUID(), capacity: row.capacity, recordedAt: at });
    row = { ...row, trips };
  } else if (
    !previous ||
    row.tripCount !== previous.tripCount ||
    row.capacity !== previous.capacity ||
    previous.trips
  )
    throw Error('รองรับรายการรายเที่ยวสูงสุด 1,000 เที่ยวต่อรถต่อวัน');
  for (const [value, kind] of [
    [row.truckId, 'truck'],
    [row.driverId, 'driver'],
    [row.teamId, 'tag'],
    [row.sourceId, 'source'],
  ]) {
    const old = dailySessions(data)
      .find((s) => s.id === id)
      ?.body.rows.find((r) => r.id === row.id);
    if (
      value &&
      !data.masters.some(
        (m) =>
          m.id === value &&
          m.kind === kind &&
          (m.active || (old && Object.values(old).includes(value))),
      )
    )
      throw Error('เลือกข้อมูลพื้นฐานที่เปิดใช้งาน');
  }
  return updateDaily(
    data,
    id,
    version,
    actor,
    'daily-update',
    (s) => {
      s.body.rows = [...s.body.rows.filter((r) => r.id !== row.id), structuredClone(row)];
    },
    reason,
  );
}
export function undoDaily(data: Data, id: string, version: number, actor: string, reason = '') {
  const last = data.audit.filter((a) => a.entityId === id).at(-1);
  if (last?.action !== 'daily-update' || !last.before)
    throw Error('ไม่มีการแก้ไขล่าสุดที่ย้อนกลับได้');
  const before = last.before as DailySession;
  return updateDaily(
    data,
    id,
    version,
    actor,
    'daily-undo',
    (s) => {
      s.body.rows = structuredClone(before.body.rows);
      s.body.verifications = {};
    },
    reason,
  );
}
export function correctDailyTrip(
  data: Data,
  id: string,
  version: number,
  rowId: string,
  tripId: string,
  capacity: number,
  actor: string,
  reason: string,
) {
  if (!reason.trim()) throw Error('กรุณาระบุเหตุผลแก้ไขรายเที่ยว');
  return updateDaily(
    data,
    id,
    version,
    actor,
    'daily-update',
    (session) => {
      const trip = session.body.rows
        .find((r) => r.id === rowId)
        ?.trips?.find((t) => t.id === tripId);
      if (!trip) throw Error('ไม่พบรายการเที่ยว');
      trip.capacity = capacity;
    },
    reason,
  );
}
export function duplicateNextDay(data: Data, id: string, actor: string) {
  const source = dailySessions(data).find((s) => s.id === id);
  if (!source) throw Error('ไม่พบวันต้นทาง');
  const date = new Date(`${source.body.date}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + 1);
  const targetDate = date.toISOString().slice(0, 10);
  const created = createDaily(data, source.projectId, targetDate, actor);
  return updateDaily(
    created,
    sessionId(source.projectId, targetDate),
    1,
    actor,
    'daily-copy',
    (s) => {
      s.body.rows = source.body.rows.map((row) => ({
        ...row,
        tripCount: 0,
        reportedTrips: null,
        notes: '',
        trips: [],
      }));
    },
  );
}
export function evidenceFor(data: Data, session: DailySession, row: DailyRow) {
  return (data.workspaces ?? []).filter(
    (r) =>
      r.recordType === 'evidence' &&
      r.body.sessionId === session.id &&
      r.body.rowId === row.id &&
      r.body.fingerprint === rowFingerprint(session, row),
  );
}
export function evidenceFiles(
  data: Data,
  session: DailySession,
  row: DailyRow,
  uploads: UploadRecord[],
) {
  const evidence = evidenceFor(data, session, row).at(-1);
  if (!evidence || evidence.recordType !== 'evidence') throw Error('ยังไม่มีหลักฐานของยอดปัจจุบัน');
  const files = evidence.body.files.map((f) => ({
    ...f,
    record: uploads.find((u) => u.id === f.uploadId),
  }));
  for (const category of ['driver-photo', 'signature', 'trip-slip'])
    if (
      !files.some(
        (f) =>
          f.category === category &&
          f.record?.status === 'synced' &&
          f.record.driveId &&
          f.record.evidenceId === evidence.id,
      )
    )
      throw Error('ต้องมีรูปคนขับ ลายเซ็น และใบเที่ยวที่อัปโหลดพร้อมยืนยัน metadata แล้ว');
  if (
    files.some(
      (f) =>
        f.record?.status !== 'synced' ||
        f.record.evidenceId !== evidence.id ||
        !f.record.driveId ||
        f.record.category !== f.category ||
        f.record.projectId !== session.projectId ||
        f.record.driverId !== row.driverId ||
        f.record.truckId !== row.truckId ||
        f.record.workDate !== session.body.date,
    )
  )
    throw Error('ยังมีหลักฐานรออัปโหลด หรือข้อมูลอ้างอิงหลักฐานไม่ตรงกัน');
  return { evidence, fileIds: files.map((f) => f.record!.driveId) };
}
export function verificationState(
  session: DailySession,
  row: DailyRow,
): 'PENDING' | 'MATCHED' | 'MISMATCHED' | 'VERIFIED' | 'REOPENED' {
  if (
    row.reportedTrips === row.tripCount &&
    session.body.verifications[row.id]?.fingerprint === rowFingerprint(session, row)
  )
    return 'VERIFIED';
  if (session.body.state === 'reopened') return 'REOPENED';
  return row.reportedTrips === null
    ? 'PENDING'
    : row.tripCount === row.reportedTrips
      ? 'MATCHED'
      : 'MISMATCHED';
}
export function verifyDaily(
  data: Data,
  id: string,
  version: number,
  actor: string,
  uploads: UploadRecord[],
  rowId?: string,
  reason = '',
) {
  return updateDaily(
    data,
    id,
    version,
    actor,
    'daily-verify',
    (s) => {
      const rows = s.body.rows.filter((r) => !rowId || r.id === rowId);
      if (!rows.length) throw Error('ไม่มีรายการให้ยืนยัน');
      if (rows.every((row) => verificationState(s, row) === 'VERIFIED'))
        throw Error('ยืนยันยอดนี้แล้ว');
      for (const row of rows) {
        if (verificationState(s, row) === 'VERIFIED') continue;
        if (!row.driverId || row.reportedTrips !== row.tripCount)
          throw Error('ระบุคนขับและตรวจยอดบันทึกกับรายงานให้ตรงกันก่อนยืนยัน');
        const { evidence, fileIds } = evidenceFiles(data, s, row, uploads);
        const verification: Verification = {
          fingerprint: rowFingerprint(s, row),
          evidenceId: evidence.id,
          fileIds,
          by: actor,
          at: new Date().toISOString(),
        };
        s.body.verifications[row.id] = verification;
      }
    },
    reason,
  );
}
export function closeDaily(
  data: Data,
  id: string,
  version: number,
  actor: string,
  uploads: UploadRecord[],
  reason = '',
) {
  return updateDaily(
    data,
    id,
    version,
    actor,
    'daily-close',
    (s) => {
      if (!s.body.rows.length || s.body.rows.some((r) => verificationState(s, r) !== 'VERIFIED'))
        throw Error('ต้องยืนยันรายการทุกคันก่อนปิดวัน');
      for (const row of s.body.rows) {
        const { evidence, fileIds } = evidenceFiles(data, s, row, uploads);
        const proof = s.body.verifications[row.id];
        if (
          proof.evidenceId !== evidence.id ||
          canonical([...proof.fileIds].sort()) !== canonical([...fileIds].sort())
        )
          throw Error('หลักฐานเปลี่ยนแล้ว กรุณายืนยันใหม่ก่อนปิดวัน');
      }
      s.body.closures.push({
        at: new Date().toISOString(),
        by: actor,
        rows: structuredClone(s.body.rows),
        verifications: structuredClone(s.body.verifications),
        trips: s.body.rows.reduce((n, r) => n + r.tripCount, 0),
        volume: s.body.rows.reduce((n, r) => n + dailyRowVolume(r), 0),
      });
      s.body.state = 'closed';
    },
    reason,
  );
}
export function reopenDaily(
  data: Data,
  id: string,
  version: number,
  actor: string,
  reason: string,
) {
  const session = dailySessions(data).find((s) => s.id === id);
  if (session?.body.state !== 'closed') throw Error('วันทำงานยังไม่ได้ปิด');
  return updateDaily(
    data,
    id,
    version,
    actor,
    'daily-reopen',
    (s) => {
      s.body.state = 'reopened';
      s.body.verifications = {};
    },
    reason,
  );
}
