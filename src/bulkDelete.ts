import { deleteRecord, recordUsage, trucksOfDriver, type DeletableType } from './deletion';
import { saveMaster } from './masterData';
import { dailySessions, deleteDailyRow } from './daily';
import { canonical, payloadOf, type Entity } from './syncModel';
import type { Data, Master } from './models';
import type { UploadRecord } from './uploads';

export interface BulkTarget {
  type: DeletableType;
  record: Entity;
  label: string;
}
export interface BulkResult {
  data: Data;
  deleted: string[];
  failed: { id: string; label: string; reason: string }[];
}

// Records that point at others go first, so one selection can remove a truck and its team.
const rank = ({ type, record }: BulkTarget) => {
  if (type === 'trip') return 0;
  if (type === 'project') return 1;
  const kind = (record as Master).kind;
  return kind === 'truck' ? 2 : kind === 'driver' ? 3 : kind === 'tag' ? 5 : 4;
};

/**
 * Applies the ordinary single-delete rules to many records. A refused record leaves the data
 * untouched and is reported; the others are still removed.
 */
export function bulkDelete(
  data: Data,
  targets: BulkTarget[],
  actor: string,
  uploads: UploadRecord[] = [],
): BulkResult {
  const result: BulkResult = { data, deleted: [], failed: [] };
  for (const { type, record, label } of [...targets].sort((a, b) => rank(a) - rank(b))) {
    try {
      const list =
        type === 'project'
          ? result.data.projects
          : type === 'master'
            ? result.data.masters
            : result.data.trips;
      const latest = list.find((item) => item.id === record.id);
      if (!latest) throw Error('ไม่พบรายการ อาจถูกลบแล้ว');
      // Changed since the user confirmed (for example by sync): do not remove it blindly.
      if (type !== 'master' && canonical(payloadOf(latest)) !== canonical(payloadOf(record)))
        throw Error('ข้อมูลเปลี่ยนแปลงแล้ว กรุณาเลือกใหม่');
      if (type === 'master' && (latest as Master).name !== (record as Master).name)
        throw Error('ข้อมูลเปลี่ยนแปลงแล้ว กรุณาเลือกใหม่');
      let next = result.data;
      if (
        type === 'master' &&
        (latest as Master).kind === 'driver' &&
        !recordUsage(next, type, record.id, uploads).length
      )
        for (const truck of trucksOfDriver(next, record.id))
          next = saveMaster(
            next,
            { ...truck, driverId: '', updatedAt: new Date().toISOString() },
            actor,
          );
      result.data = deleteRecord(next, type, record.id, actor, uploads);
      result.deleted.push(record.id);
    } catch (error) {
      result.failed.push({
        id: record.id,
        label,
        reason: error instanceof Error ? error.message.replace(/^ลบไม่ได้: /, '') : 'ลบไม่สำเร็จ',
      });
    }
  }
  return result;
}

/** Removes several trucks from one work day, each through the ordinary single-row rules. */
export function bulkDeleteDailyRows(
  data: Data,
  sessionId: string,
  rows: { id: string; label: string }[],
  actor: string,
  reason: string,
): BulkResult {
  const result: BulkResult = { data, deleted: [], failed: [] };
  for (const row of rows) {
    try {
      const session = dailySessions(result.data).find((item) => item.id === sessionId);
      if (!session) throw Error('ไม่พบวันทำงาน');
      result.data = deleteDailyRow(
        result.data,
        sessionId,
        session.body.version,
        row.id,
        actor,
        reason,
      );
      result.deleted.push(row.id);
    } catch (error) {
      result.failed.push({
        ...row,
        reason: error instanceof Error ? error.message.replace(/^ลบไม่ได้: /, '') : 'ลบไม่สำเร็จ',
      });
    }
  }
  return result;
}
