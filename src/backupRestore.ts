import { emptyData, type Audit, type Data } from './models';
import {
  canonical,
  collections,
  integrityIssues,
  payloadOf,
  prepareSync,
  type Entity,
} from './syncModel';
import { validateCloudRecord } from './cloudValidation';
import { notifyDataChanged, openLocalDatabase } from './storage';
import type { UploadRecord } from './uploads';
import { readBlobBytes } from './files';

const maximumBackupBytes = 150 * 1024 * 1024;
const deletedKey = {
  projects: 'deletedProjects',
  masters: 'deletedMasters',
  trips: 'deletedTrips',
  workspaces: 'deletedWorkspaces',
} as const;
export interface RestorePreview {
  added: number;
  identical: number;
  conflicts: string[];
  filesAdded: number;
  filesKept: number;
  deletedSkipped: number;
  exportedAt: string;
  daysToRecheck: number;
}
interface Plan {
  owner: string;
  baseline: string;
  data: Data;
  uploads: UploadRecord[];
  summary: { added: number; conflictsKept: number };
  originalDailyStates: Entity[];
}
// Keep validated data private: changing a preview's display counts cannot change a write.
const plans = new WeakMap<RestorePreview, Plan>();
function object(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}
function string(value: unknown, max = 1000): value is string {
  return typeof value === 'string' && value.length <= max;
}
function validateData(raw: unknown): Data {
  if (
    !object(raw) ||
    !['projects', 'masters', 'trips', 'audit'].every((key) => Array.isArray(raw[key])) ||
    ['workspaces', 'deletedProjects', 'deletedMasters', 'deletedTrips', 'deletedWorkspaces'].some(
      (key) => raw[key] !== undefined && !Array.isArray(raw[key]),
    )
  )
    throw Error('โครงสร้างข้อมูลสำรองไม่ถูกต้อง');
  const data = raw as unknown as Data;
  // Do not trust backup sync cursors, acknowledgements, credentials or outbox.
  const copy = { ...data, sync: undefined };
  const count = collections.reduce(
    (sum, kind) => sum + (copy[kind]?.length ?? 0) + (copy[deletedKey[kind]]?.length ?? 0),
    0,
  );
  if (count > 100000 || data.audit.length > 100000)
    throw Error('ข้อมูลสำรองมีรายการมากเกินขอบเขตการกู้คืนครั้งนี้');
  for (const kind of collections) {
    const seen = new Set<string>();
    for (const value of [...(copy[kind] ?? []), ...(copy[deletedKey[kind]] ?? [])]) {
      if (!object(value) || seen.has(String(value.id)))
        throw Error('ข้อมูลสำรองมี ID ซ้ำหรือรายการผิดรูปแบบ');
      seen.add(String(value.id));
      const payload = payloadOf(value as unknown as Entity);
      delete (payload as Entity & { deletedAt?: string }).deletedAt;
      validateCloudRecord(kind, {
        schemaVersion: 1,
        id: value.id,
        revision: 1,
        operationId: 'backup-validation',
        createdAt: value.createdAt,
        updatedAt: value.updatedAt,
        deletedAt: 'deletedAt' in value ? value.deletedAt : null,
        payload,
      });
    }
  }
  const seenAudit = new Set<string>();
  for (const audit of data.audit) {
    if (
      !object(audit) ||
      !['id', 'entityId', 'action', 'at', 'actor'].every((field) => string(audit[field], 1000)) ||
      !audit.id ||
      seenAudit.has(audit.id)
    )
      throw Error('ประวัติข้อมูลสำรองไม่ถูกต้องหรือ ID ซ้ำ');
    seenAudit.add(audit.id);
  }
  return copy;
}
function parseUpload(value: unknown, owner: string): UploadRecord {
  if (
    !object(value) ||
    value.owner !== owner ||
    ![
      'id',
      'projectId',
      'tripId',
      'name',
      'mimeType',
      'createdAt',
      'driveId',
      'folderId',
      'error',
    ].every((field) => string(value[field])) ||
    !value.id ||
    !value.projectId ||
    !value.name ||
    !Number.isSafeInteger(value.size) ||
    Number(value.size) <= 0 ||
    Number(value.size) > 100 * 1024 * 1024 ||
    !['pending', 'preparing', 'uploading', 'metadata-pending', 'synced', 'error'].includes(
      String(value.status),
    ) ||
    !(String(value.mimeType).startsWith('image/') || value.mimeType === 'application/pdf') ||
    ['evidenceId', 'driverName', 'truckName', 'driverId', 'truckId', 'workDate'].some(
      (field) => value[field] !== undefined && !string(value[field]),
    ) ||
    (value.category !== undefined &&
      !['driver-photo', 'signature', 'trip-slip'].includes(String(value.category)))
  )
    throw Error('ข้อมูลไฟล์แนบไม่ถูกต้องหรือไม่ตรงกับบัญชี');
  const { blobBase64, ...record } = value;
  const allowed = new Set([
    'id',
    'owner',
    'projectId',
    'tripId',
    'name',
    'mimeType',
    'size',
    'createdAt',
    'status',
    'driveId',
    'folderId',
    'error',
    'evidenceId',
    'driverName',
    'truckName',
    'driverId',
    'truckId',
    'workDate',
    'category',
  ]);
  if (Object.keys(record).some((key) => !allowed.has(key)))
    throw Error('ข้อมูลไฟล์แนบมีฟิลด์ที่ไม่รองรับ');
  let blob: Blob | undefined;
  if (blobBase64 !== null) {
    if (
      typeof blobBase64 !== 'string' ||
      blobBase64.length !== 4 * Math.ceil(Number(value.size) / 3) ||
      /[^A-Za-z0-9+/=]/.test(blobBase64) ||
      (blobBase64.indexOf('=') !== -1 &&
        blobBase64.indexOf('=') !== blobBase64.length - (blobBase64.endsWith('==') ? 2 : 1))
    )
      throw Error('ไฟล์แนบ Base64 หรือขนาดไม่ถูกต้อง');
    const decoded = atob(blobBase64);
    if (decoded.length !== value.size) throw Error('ขนาดไฟล์แนบไม่ตรงกับข้อมูลสำรอง');
    blob = new Blob([Uint8Array.from(decoded, (char) => char.charCodeAt(0))], {
      type: String(value.mimeType),
    });
  } else if (value.status !== 'synced' || !value.driveId)
    throw Error('ข้อมูลสำรองขาดไฟล์ต้นฉบับที่ยังอัปโหลดไม่เสร็จ');
  // Never import a backup's target folder. Resolve the canonical project folder
  // using the existing Drive workflow before any pending upload is resumed.
  return {
    ...record,
    folderId: '',
    status: 'error',
    error: 'นำเข้าจากข้อมูลสำรอง กรุณาเชื่อม Drive เพื่อยืนยันไฟล์อีกครั้ง',
    ...(blob ? { blob } : {}),
  } as unknown as UploadRecord;
}
function manifest(data: Data, uploads: UploadRecord[]) {
  return canonical({
    data,
    uploads: uploads
      .map(({ blob, ...record }) => ({ ...record, blobSize: blob?.size, blobType: blob?.type }))
      .sort((a, b) => a.id.localeCompare(b.id)),
  });
}
function validateRelations(data: Data, uploads: UploadRecord[]) {
  const issues = integrityIssues(data);
  if (issues.length)
    throw Error(`กู้คืนไม่ได้: ความสัมพันธ์ข้อมูลไม่ครบ (${issues[0]}) ข้อมูลเดิมยังอยู่`);
  for (const upload of uploads) {
    if (
      ![...data.projects, ...(data.deletedProjects ?? [])].some((p) => p.id === upload.projectId) ||
      (upload.tripId &&
        ![...data.trips, ...(data.deletedTrips ?? [])].some(
          (t) => t.id === upload.tripId && t.projectId === upload.projectId,
        ))
    )
      throw Error('ไฟล์แนบไม่ตรงกับโครงการหรือเที่ยวรถ');
    if (upload.evidenceId) {
      const evidence = data.workspaces?.find((record) => record.id === upload.evidenceId);
      if (
        !evidence ||
        evidence.recordType !== 'evidence' ||
        evidence.projectId !== upload.projectId ||
        evidence.body.truckId !== upload.truckId ||
        evidence.body.driverId !== upload.driverId ||
        evidence.body.date !== upload.workDate ||
        !evidence.body.files.some(
          (file) =>
            file.uploadId === upload.id &&
            file.category === upload.category &&
            file.name === upload.name,
        )
      )
        throw Error('ไฟล์แนบไม่ตรงกับหลักฐานงานรายวัน');
    }
  }
}
export async function previewLocalRestore(owner: string, file: Blob): Promise<RestorePreview> {
  if (!file.size || file.size > maximumBackupBytes)
    throw Error('รองรับข้อมูลสำรอง JSON ไม่เกิน 150 MB ต่อครั้ง');
  let raw: unknown;
  try {
    raw = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(await readBlobBytes(file)));
  } catch {
    throw Error('อ่าน JSON สำรองไม่สำเร็จ กรุณาเลือกไฟล์สำรองที่สมบูรณ์');
  }
  if (!object(raw) || raw.format !== 'construction-ops-backup' || raw.version !== 1)
    throw Error('ไม่รองรับรูปแบบหรือเวอร์ชันข้อมูลสำรอง');
  if (raw.owner !== owner)
    throw Error('ข้อมูลสำรองเป็นของบัญชีอื่น กรุณาเข้าสู่บัญชีเดิมก่อนกู้คืน');
  if (
    !string(raw.exportedAt) ||
    !Number.isFinite(Date.parse(raw.exportedAt)) ||
    !Array.isArray(raw.uploads)
  )
    throw Error('ข้อมูลสำรองไม่ครบ');
  const source = raw.state === null ? structuredClone(emptyData) : validateData(raw.state);
  const files = raw.uploads.map((value) => parseUpload(value, owner));
  if (new Set(files.map((file) => file.id)).size !== files.length)
    throw Error('ID ไฟล์แนบซ้ำในข้อมูลสำรอง');
  const db = await openLocalDatabase();
  try {
    const tx = db.transaction(['state', 'uploads'], 'readonly');
    const [current, allFiles]: [Data, UploadRecord[]] = await Promise.all([
      tx
        .objectStore('state')
        .get(owner)
        .then((value) => value ?? structuredClone(emptyData)),
      tx.objectStore('uploads').getAll(),
    ]);
    await tx.done;
    const ownerFiles = allFiles.filter((file) => file.owner === owner);
    const next = structuredClone(current);
    const preview: RestorePreview = {
      added: 0,
      identical: 0,
      conflicts: [],
      filesAdded: 0,
      filesKept: 0,
      deletedSkipped: 0,
      exportedAt: raw.exportedAt,
      daysToRecheck: 0,
    };
    const originalDailyStates: Entity[] = [];
    for (const kind of collections) {
      const occupied = new Map(
        [...(current[kind] ?? []), ...(current[deletedKey[kind]] ?? [])].map((record) => [
          record.id,
          record,
        ]),
      );
      const added: Entity[] = [];
      for (const record of source[kind] ?? []) {
        const old = occupied.get(record.id);
        // Sync-only tombstones may survive after local compaction: never resurrect them.
        if (old || current.sync?.entries[`${kind}/${record.id}`]?.desired.deletedAt) {
          if (
            old &&
            !('deletedAt' in old) &&
            canonical(payloadOf(old)) === canonical(payloadOf(record))
          )
            preview.identical++;
          else preview.conflicts.push(`${kind}/${record.id}`);
        } else {
          if (
            'recordType' in record &&
            record.recordType === 'daily' &&
            (record.body.state === 'closed' || Object.keys(record.body.verifications).length)
          ) {
            originalDailyStates.push(structuredClone(record));
            added.push({
              ...record,
              updatedAt: new Date().toISOString(),
              body: {
                ...record.body,
                state: 'reopened',
                version: record.body.version + 1,
                verifications: {},
                reason:
                  'กู้คืนจาก JSON ต้องตรวจหลักฐาน Cloud และยืนยันใหม่ ประวัติปิดวันเดิมเก็บไว้ใน Snapshot',
              },
            });
            preview.daysToRecheck++;
          } else added.push(record);
          preview.added++;
        }
      }
      Object.assign(next, { [kind]: [...(current[kind] ?? []), ...added] });
      preview.deletedSkipped += source[deletedKey[kind]]?.length ?? 0;
    }
    const audits = new Map(current.audit.map((audit) => [audit.id, audit]));
    for (const audit of source.audit) {
      if (!audits.has(audit.id)) next.audit.push(structuredClone(audit));
      else if (canonical(audits.get(audit.id)) !== canonical(audit))
        preview.conflicts.push(`audit/${audit.id}`);
    }
    const importedFiles: UploadRecord[] = [];
    for (const upload of files) {
      const old = allFiles.find((file) => file.id === upload.id);
      if (old) {
        if (old.owner !== owner) throw Error('รหัสไฟล์แนบชนกับข้อมูลที่ไม่สามารถกู้คืนร่วมกันได้');
        preview.filesKept++;
      } else {
        importedFiles.push(upload);
        preview.filesAdded++;
      }
    }
    validateRelations(next, [...ownerFiles, ...importedFiles]);
    plans.set(preview, {
      owner,
      baseline: manifest(current, ownerFiles),
      data: next,
      uploads: importedFiles,
      summary: { added: preview.added, conflictsKept: preview.conflicts.length },
      originalDailyStates,
    });
    return preview;
  } finally {
    db.close();
  }
}
export async function applyLocalRestore(
  owner: string,
  preview: RestorePreview,
  isCurrentOwner = () => true,
) {
  const plan = plans.get(preview);
  if (!plan || plan.owner !== owner || !isCurrentOwner())
    throw Error('ตัวอย่างกู้คืนหมดอายุหรือบัญชีเปลี่ยน กรุณาตรวจใหม่');
  const db = await openLocalDatabase();
  try {
    const tx = db.transaction(['state', 'uploads'], 'readwrite');
    try {
      const store = tx.objectStore('state');
      const current: Data = (await store.get(owner)) ?? structuredClone(emptyData);
      const allFiles: UploadRecord[] = await tx.objectStore('uploads').getAll();
      if (
        !isCurrentOwner() ||
        manifest(
          current,
          allFiles.filter((file) => file.owner === owner),
        ) !== plan.baseline
      )
        throw Error('ข้อมูลเปลี่ยนหลังดูตัวอย่าง กรุณาเลือกไฟล์และตรวจตัวอย่างใหม่');
      if (!current.sync && !(await store.get(['phase1-backup', owner])))
        await store.put(current, ['phase1-backup', owner]);
      if (current.workspaces === undefined && !(await store.get(['v4-backup', owner])))
        await store.put(current, ['v4-backup', owner]);
      const next = prepareSync(current, plan.data);
      const audit: Audit = {
        id: crypto.randomUUID(),
        entityId: 'backup-restore',
        action: 'restore-missing-only',
        at: new Date().toISOString(),
        actor: owner,
        before: { importedDailyStates: plan.originalDailyStates },
        after: { ...plan.summary, filesAdded: plan.uploads.length },
      };
      next.audit.push(audit);
      for (const upload of plan.uploads) await tx.objectStore('uploads').add(upload);
      if (!isCurrentOwner()) throw Error('บัญชีเปลี่ยน กรุณาตรวจใหม่');
      await store.put(next, owner);
      await tx.done;
      plans.delete(preview);
      notifyDataChanged(owner);
      window.dispatchEvent(new Event('construction-uploads-changed'));
    } catch (error) {
      try {
        tx.abort();
      } catch {
        /* The request may already have aborted this transaction. */
      }
      await tx.done.catch(() => {});
      throw error;
    }
  } finally {
    db.close();
  }
}
