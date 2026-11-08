import type { Data, Trip } from './models';
import { canonical } from './syncModel';
import { openLocalDatabase } from './storage';

export interface DuplicateCandidate {
  fingerprint: string;
  trips: Trip[];
}
export interface DuplicateReview {
  id: string;
  fingerprint: string;
  decision: 'distinct' | 'needs-correction';
  reason: string;
  at: string;
}
// Minute precision is only a review signal. Daily batch transactions intentionally
// share timestamps, so they are never inferred to be duplicate legacy trips here.
export function duplicateCandidates(data: Pick<Data, 'trips'>): DuplicateCandidate[] {
  const groups = new Map<string, Trip[]>();
  for (const trip of data.trips) {
    const key = canonical([
      trip.projectId,
      trip.truckId,
      trip.date,
      trip.time,
      trip.driverId,
      trip.sourceId,
      trip.soilType,
      trip.capacityPerTrip ?? null,
    ]);
    const group = groups.get(key) ?? [];
    group.push(trip);
    groups.set(key, group);
  }
  return [...groups.values()]
    .filter((trips) => trips.length > 1)
    .map((trips) => {
      const ordered = [...trips].sort((a, b) => a.id.localeCompare(b.id));
      return {
        trips: ordered,
        fingerprint: canonical(ordered.map(({ syncStatus: _status, ...trip }) => trip)),
      };
    });
}
export async function loadDuplicateReviews(owner: string): Promise<DuplicateReview[]> {
  const db = await openLocalDatabase();
  try {
    return (await db.get('driveSettings', ['duplicate-reviews', owner])) ?? [];
  } finally {
    db.close();
  }
}
export async function saveDuplicateReview(
  owner: string,
  candidate: DuplicateCandidate,
  decision: DuplicateReview['decision'],
  reason: string,
): Promise<DuplicateReview[]> {
  if (!['distinct', 'needs-correction'].includes(decision)) throw Error('เลือกผลการตรวจ');
  if (!reason.trim() || reason.trim().length > 500) throw Error('ระบุเหตุผล 1–500 ตัวอักษร');
  const db = await openLocalDatabase();
  try {
    const tx = db.transaction(['state', 'driveSettings'], 'readwrite');
    try {
      const data: Data | undefined = await tx.objectStore('state').get(owner);
      if (
        !data ||
        !duplicateCandidates(data).some((item) => item.fingerprint === candidate.fingerprint)
      )
        throw Error('รายการเปลี่ยนแล้ว กรุณาตรวจข้อมูลล่าสุดก่อนยืนยันอีกครั้ง');
      const store = tx.objectStore('driveSettings');
      const reviews: DuplicateReview[] = (await store.get(['duplicate-reviews', owner])) ?? [];
      if (reviews.length >= 10000)
        throw Error('ประวัติการตรวจเต็ม กรุณาสำรองข้อมูลและติดต่อผู้ดูแล');
      const next = [
        ...reviews,
        {
          id: crypto.randomUUID(),
          fingerprint: candidate.fingerprint,
          decision,
          reason: reason.trim(),
          at: new Date().toISOString(),
        },
      ];
      await store.put(next, ['duplicate-reviews', owner]);
      await tx.done;
      return next;
    } catch (error) {
      try {
        tx.abort();
      } catch {
        /* Preserve the original failure if already aborted. */
      }
      await tx.done.catch(() => {});
      throw error;
    }
  } finally {
    db.close();
  }
}
