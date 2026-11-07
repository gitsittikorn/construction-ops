import { validateUploadedFile, type DriveFile } from './drive';
import type { UploadRecord } from './uploads';

export interface DocumentAudit {
  checked: number;
  issues: { id: string; name: string; kind: 'missing' | 'mismatch' | 'unmapped' }[];
}
export async function auditDriveDocuments(
  owner: string,
  records: UploadRecord[],
  transport: {
    list: () => Promise<DriveFile[]>;
    get: (id: string) => Promise<DriveFile | null>;
    active: () => boolean;
  },
): Promise<DocumentAudit> {
  const active = () => {
    if (!transport.active()) throw Error('บัญชีหรือการเชื่อมต่อเปลี่ยนแล้ว หยุดตรวจไฟล์');
  };
  active();
  if (records.some((record) => record.owner !== owner)) throw Error('บัญชีของรายการไฟล์ไม่ตรงกัน');
  const inventory = await transport.list();
  active();
  const issues: DocumentAudit['issues'] = [];
  let checked = 0;
  for (const record of records.filter((item) => item.status === 'synced')) {
    active();
    const file = await transport.get(record.driveId);
    active();
    checked++;
    if (!file || file.trashed) issues.push({ id: record.id, name: record.name, kind: 'missing' });
    else {
      try {
        validateUploadedFile(file, record);
      } catch {
        issues.push({ id: record.id, name: record.name, kind: 'mismatch' });
      }
    }
  }
  // Include pending records: an unacknowledged upload is not an orphan candidate.
  const knownFiles = new Set(records.map((record) => record.driveId).filter(Boolean));
  const knownOperations = new Set(records.map((record) => record.id));
  for (const file of inventory) {
    active();
    if (file.appProperties?.owner !== owner) throw Error('รายการไฟล์ Drive ไม่ตรงกับบัญชี');
    if (
      !file.trashed &&
      !knownFiles.has(file.id) &&
      !knownOperations.has(file.appProperties?.operationId ?? '')
    )
      issues.push({ id: file.id, name: file.name || file.id, kind: 'unmapped' });
  }
  return { checked, issues };
}
