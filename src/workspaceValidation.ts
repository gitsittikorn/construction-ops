import type { WorkspaceRecord } from './workspaceModels';
import { calculateSurvey } from './surveying';
import { canonical } from './syncModel';
import { validateDailyTrips } from './dailyTrips';

export function validateWorkspace(value: unknown): asserts value is WorkspaceRecord {
  const r = value as WorkspaceRecord;
  if (
    !r ||
    !['daily', 'evidence', 'survey'].includes(r.recordType) ||
    typeof r.name !== 'string' ||
    typeof r.projectId !== 'string' ||
    !r.projectId ||
    !r.body ||
    Object.keys(r).some(
      (key) =>
        !['id', 'createdAt', 'updatedAt', 'recordType', 'projectId', 'name', 'body'].includes(key),
    )
  )
    throw Error('รูปแบบข้อมูลการทำงานไม่ถูกต้อง');
  if (r.recordType === 'daily') {
    const b = r.body;
    if (
      r.id !== `daily-${r.projectId}-${b.date}` ||
      Object.keys(b).some(
        (key) =>
          ![
            'date',
            'version',
            'state',
            'rows',
            'verifications',
            'closures',
            'reason',
            'history',
          ].includes(key),
      )
    )
      throw Error('โครงสร้างวันทำงานไม่รองรับ');
    if (
      !/^\d{4}-\d{2}-\d{2}$/.test(b.date) ||
      !Number.isSafeInteger(b.version) ||
      b.version < 1 ||
      !['open', 'closed', 'reopened'].includes(b.state) ||
      !Array.isArray(b.rows) ||
      !b.verifications ||
      !Array.isArray(b.closures) ||
      typeof b.reason !== 'string'
    )
      throw Error('รูปแบบวันทำงานไม่ถูกต้อง');
    const ids = new Set<string>(),
      tripIds = new Set<string>(),
      trucks = new Set<string>();
    for (const row of b.rows) {
      validateDailyTrips(row);
      for (const trip of row.transactions ?? []) {
        if (tripIds.has(trip.id)) throw Error('รหัสเที่ยวซ้ำในวันทำงาน');
        tripIds.add(trip.id);
      }
      if (
        row.trips &&
        (!Array.isArray(row.trips) ||
          row.trips.length !== row.tripCount ||
          new Set(row.trips.map((t) => t.id)).size !== row.trips.length ||
          row.trips.some(
            (t) =>
              typeof t.id !== 'string' ||
              !t.id ||
              !Number.isFinite(t.capacity) ||
              t.capacity <= 0 ||
              !Number.isFinite(Date.parse(t.recordedAt)),
          ))
      )
        throw Error('ข้อมูลรายเที่ยวไม่ถูกต้อง');
      if (
        ['id', 'truckId', 'driverId', 'teamId', 'sourceId', 'soilType', 'notes'].some(
          (key) => typeof row[key as keyof typeof row] !== 'string',
        ) ||
        !row.id ||
        !row.truckId ||
        ids.has(row.id) ||
        trucks.has(row.truckId) ||
        !Number.isSafeInteger(row.tripCount) ||
        row.tripCount < 0 ||
        !Number.isFinite(row.capacity) ||
        row.capacity <= 0 ||
        !(
          row.reportedTrips === null ||
          (Number.isSafeInteger(row.reportedTrips) && row.reportedTrips >= 0)
        )
      )
        throw Error('รูปแบบรายการรถไม่ถูกต้อง');
      ids.add(row.id);
      trucks.add(row.truckId);
    }
    for (const proof of Object.values(b.verifications))
      if (
        !proof ||
        ['fingerprint', 'evidenceId', 'by', 'at'].some(
          (key) => typeof proof[key as keyof typeof proof] !== 'string',
        ) ||
        !Array.isArray(proof.fileIds) ||
        proof.fileIds.some((id) => typeof id !== 'string')
      )
        throw Error('รูปแบบการยืนยันไม่ถูกต้อง');
    for (const snapshot of b.closures)
      if (
        !snapshot ||
        !Array.isArray(snapshot.rows) ||
        !snapshot.verifications ||
        typeof snapshot.by !== 'string' ||
        typeof snapshot.at !== 'string' ||
        !Number.isFinite(snapshot.trips) ||
        !Number.isFinite(snapshot.volume)
      )
        throw Error('Snapshot ปิดวันไม่ถูกต้อง');
    if (
      b.state === 'closed' &&
      (!b.closures.length ||
        canonical(b.closures.at(-1)!.rows) !== canonical(b.rows) ||
        b.rows.some((row) => !b.verifications[row.id]))
    )
      throw Error('Snapshot ไม่ตรงกับวันปิด');
  } else if (r.recordType === 'evidence') {
    const b = r.body;
    if (
      b.signature &&
      (b.signature.signerId !== b.driverId ||
        typeof b.signature.signerName !== 'string' ||
        !b.signature.signerName.trim() ||
        !Number.isFinite(Date.parse(b.signature.signedAt)) ||
        !b.files.some((f) => f.category === 'signature' && f.uploadId === b.signature!.uploadId))
    )
      throw Error('ข้อมูลผู้ลงลายเซ็นไม่ตรงกับหลักฐาน');
    if (
      !/^\d{4}-\d{2}-\d{2}$/.test(b.date) ||
      ['sessionId', 'rowId', 'truckId', 'driverId', 'fingerprint'].some(
        (key) => typeof b[key as keyof typeof b] !== 'string',
      ) ||
      !Array.isArray(b.files) ||
      b.files.some(
        (f) =>
          !['driver-photo', 'signature', 'trip-slip'].includes(f.category) ||
          typeof f.uploadId !== 'string' ||
          typeof f.name !== 'string',
      ) ||
      new Set(b.files.map((f) => f.uploadId)).size !== b.files.length
    )
      throw Error('รูปแบบหลักฐานไม่ถูกต้อง');
  } else {
    const b = r.body;
    if (
      ['benchmark', 'datum', 'notes'].some((key) => typeof b[key as keyof typeof b] !== 'string') ||
      [
        'elevation',
        'width',
        'length',
        'spacingX',
        'spacingY',
        'designLevel',
        'slopeX',
        'slopeY',
        'allowance',
        'cutSwell',
      ].some(
        (key) =>
          typeof b[key as keyof typeof b] !== 'number' ||
          !Number.isFinite(b[key as keyof typeof b]),
      ) ||
      !Array.isArray(b.points) ||
      b.points.length > 2500 ||
      !Array.isArray(b.observations) ||
      !['uniform', 'slope', 'custom'].includes(b.design)
    )
      throw Error('รูปแบบงานสำรวจไม่ถูกต้อง');
    calculateSurvey(b);
  }
}
