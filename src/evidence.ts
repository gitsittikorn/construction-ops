import { loadData, updateDataAndUploads } from './storage';
import { readBlobBytes } from './files';
import { commitWorkspace, dailySessions, evidenceFor, rowFingerprint, updateDaily } from './daily';
import { companyId, managesBusiness } from './workspaceIdentity';
import { canonical } from './syncModel';
import type { EvidenceCategory, EvidenceRecord } from './workspaceModels';
import type { UploadRecord } from './uploads';

export async function sha256(value: Blob | string) {
  const bytes =
    typeof value === 'string'
      ? new TextEncoder().encode(value)
      : new Uint8Array(await readBlobBytes(value));
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('');
}
export async function saveEvidence(
  owner: string,
  sessionId: string,
  rowId: string,
  category: EvidenceCategory,
  files: File[],
) {
  if (!files.length) throw Error('กรุณาเลือกหลักฐานก่อนบันทึก');
  if (category !== 'trip-slip' && files.length !== 1)
    throw Error('รูปคนขับและลายเซ็นบันทึกครั้งละหนึ่งไฟล์');
  if (files.some((f) => !f.type.startsWith('image/') || !f.size || f.size > 100 * 1024 * 1024))
    throw Error('หลักฐานต้องเป็นรูปภาพต้นฉบับ ไม่เกิน 100 MB ต่อไฟล์');
  const data = await loadData(owner),
    session = dailySessions(data).find((s) => s.id === sessionId),
    row = session?.body.rows.find((r) => r.id === rowId);
  if (!session || !row || !row.driverId || session.body.state === 'closed')
    throw Error('เลือกวันทำงานที่เปิดอยู่และระบุคนขับก่อนเก็บหลักฐาน');
  const fingerprint = rowFingerprint(session, row),
    closureGeneration = session.body.closures.length,
    existing = evidenceFor(data, session, row).at(-1),
    context = `${companyId(owner)}:${sessionId}:${rowId}:${fingerprint}`,
    evidenceId =
      existing?.id ??
      `evidence-${await sha256(closureGeneration ? `${context}:closure:${closureGeneration}` : context)}`;
  const records: UploadRecord[] = await Promise.all(
    files.map(async (file) => ({
      id: `upload-${await sha256(`${evidenceId}:${category}:${await sha256(file)}`)}`,
      owner,
      projectId: session.projectId,
      tripId: '',
      evidenceId,
      driverId: row.driverId,
      truckId: row.truckId,
      workDate: session.body.date,
      category,
      name: file.name,
      mimeType: file.type,
      size: file.size,
      createdAt: new Date().toISOString(),
      status: 'pending',
      driveId: '',
      folderId: '',
      error: '',
      blob: file,
    })),
  );
  const unique = [
    ...new Map(
      records.map((r) => [
        r.id,
        {
          ...r,
          driverName: data.masters.find((m) => m.id === row.driverId)?.name ?? row.driverId,
          truckName: data.masters.find((m) => m.id === row.truckId)?.name ?? row.truckId,
        },
      ]),
    ).values(),
  ];
  return updateDataAndUploads(owner, unique, (latest) => {
    const current = dailySessions(latest).find((s) => s.id === sessionId),
      currentRow = current?.body.rows.find((r) => r.id === rowId);
    if (
      !current ||
      !currentRow ||
      current.body.state === 'closed' ||
      current.body.closures.length !== closureGeneration ||
      rowFingerprint(current, currentRow) !== fingerprint
    )
      throw Error('ยอดหรือข้อมูลคนขับเปลี่ยนแล้ว กรุณาบันทึกหลักฐานใหม่');
    const before = latest.workspaces?.find((r) => r.id === evidenceId);
    if (before && before.recordType !== 'evidence') throw Error('รหัสหลักฐานไม่ถูกต้อง');
    const existing = before?.body.files ?? [];
    const additions = unique.map((r) => ({ uploadId: r.id, category, name: r.name }));
    const files = [
      ...new Map(
        [
          ...existing.filter((f) => category === 'trip-slip' || f.category !== category),
          ...additions,
        ].map((f) => [f.uploadId, f]),
      ).values(),
    ];
    const now = new Date().toISOString();
    if (
      before &&
      canonical([...existing].sort((a, b) => a.uploadId.localeCompare(b.uploadId))) ===
        canonical([...files].sort((a, b) => a.uploadId.localeCompare(b.uploadId)))
    )
      return latest;
    if (current.body.verifications[rowId] && !managesBusiness(owner))
      throw Error('ผู้จัดการต้องยกเลิกการยืนยันก่อนเปลี่ยนหลักฐาน ข้อมูลเดิมยังอยู่');
    const record: EvidenceRecord = {
      id: evidenceId,
      recordType: 'evidence',
      projectId: current.projectId,
      name: `หลักฐาน ${current.body.date}`,
      createdAt: before?.createdAt ?? now,
      updatedAt: now,
      body: {
        closureGeneration,
        ...(before?.body.signature ? { signature: before.body.signature } : {}),
        ...(category === 'signature'
          ? {
              signature: {
                signerId: currentRow.driverId,
                signerName:
                  latest.masters.find((m) => m.id === currentRow.driverId)?.name ??
                  currentRow.driverId,
                signedAt: now,
                uploadId: unique[0].id,
              },
            }
          : {}),
        sessionId,
        rowId,
        date: current.body.date,
        truckId: currentRow.truckId,
        driverId: currentRow.driverId,
        fingerprint,
        files,
      },
    };
    const invalidated = current.body.verifications[rowId]
      ? updateDaily(
          latest,
          current.id,
          current.body.version,
          owner,
          'evidence-replace',
          (s) => {
            delete s.body.verifications[rowId];
          },
          'เปลี่ยนหลักฐานหลังยืนยัน',
        )
      : latest;
    return commitWorkspace(invalidated, record, owner, 'evidence-save');
  });
}
export function evidenceStatus(files: UploadRecord[], verified: boolean) {
  if (verified) return 'VERIFIED';
  if (files.some((f) => f.status === 'error')) return 'FAILED';
  if (files.some((f) => ['uploading', 'preparing', 'metadata-pending'].includes(f.status)))
    return 'UPLOADING';
  if (
    !['driver-photo', 'signature', 'trip-slip'].every((role) =>
      files.some((f) => f.category === role),
    )
  )
    return 'INCOMPLETE';
  return files.every((f) => f.status === 'synced' && !!f.driveId) ? 'UPLOADED' : 'READY';
}
export async function storageWarning() {
  const estimate = await navigator.storage?.estimate?.();
  return estimate?.quota && (estimate.usage ?? 0) / estimate.quota > 0.85
    ? 'พื้นที่เก็บข้อมูลใกล้เต็ม กรุณาอัปโหลดหรือสำรองข้อมูล อย่าล้างข้อมูลเว็บไซต์'
    : '';
}
