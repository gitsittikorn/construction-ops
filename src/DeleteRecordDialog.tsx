import { useEffect, useState } from 'react';
import ConfirmDialog from './ConfirmDialog';
import { deleteRecord, recordUsage, trucksOfDriver, type DeletableType } from './deletion';
import { saveMaster } from './masterData';
import { canonical, payloadOf, type Entity } from './syncModel';
import { listUploads, type UploadRecord } from './uploads';
import { actorUid } from './workspaceIdentity';
import type { Data, Master, Project } from './models';

export default function DeleteRecordDialog({
  data,
  owner,
  type,
  record,
  label,
  onChange,
  onDone,
  onCancel,
}: {
  data: Data;
  owner: string;
  type: DeletableType;
  record: Entity;
  label: string;
  onChange: (change: (data: Data) => Data) => Promise<void>;
  onDone: (message: string) => void;
  onCancel: () => void;
}) {
  const [uploads, setUploads] = useState<UploadRecord[] | null>(null);
  const [loadError, setLoadError] = useState('');
  useEffect(() => {
    let active = true;
    void listUploads(owner)
      .then((rows) => {
        if (active) setUploads(rows);
      })
      .catch(() => {
        if (active) setLoadError('ตรวจเอกสารที่อ้างอิงไม่สำเร็จ จึงยังลบไม่ได้ กรุณาลองใหม่');
      });
    return () => {
      active = false;
    };
  }, [owner]);

  const list = (value: Data) =>
    type === 'project' ? value.projects : type === 'master' ? value.masters : value.trips;
  // Refuse to act on a record that changed (for example by sync) after the dialog opened.
  function current(value: Data) {
    const latest = list(value).find((item) => item.id === record.id);
    if (!latest) throw Error('ไม่พบรายการ อาจถูกลบแล้ว กรุณาเปิดรายการใหม่');
    if (canonical(payloadOf(latest)) !== canonical(payloadOf(record)))
      throw Error('ข้อมูลเปลี่ยนแปลงแล้ว กรุณาปิดหน้าต่างและเลือกรายการใหม่');
    return latest;
  }

  const blockers = uploads ? recordUsage(data, type, record.id, uploads) : [];
  const driver = type === 'master' && 'kind' in record && record.kind === 'driver';
  const linked = driver ? trucksOfDriver(data, record.id) : [];

  const confirm = async () => {
    const files = await listUploads(owner);
    await onChange((old) => {
      current(old);
      let next = old;
      // Unlinking is announced in the dialog; trucks are kept.
      if (driver && !recordUsage(old, type, record.id, files).length)
        for (const truck of trucksOfDriver(old, record.id))
          next = saveMaster(
            next,
            { ...truck, driverId: '', updatedAt: new Date().toISOString() },
            owner,
          );
      return deleteRecord(next, type, record.id, owner, files);
    });
    onDone(`ลบ ${label} แล้ว โดยเก็บข้อมูลและประวัติไว้`);
  };

  const canDeactivate = type === 'master' && 'active' in record && (record as Master).active;
  const canArchive = type === 'project' && (record as Project).status !== 'archived';
  const alternative =
    canDeactivate && (record as Master).kind !== 'soilPrice'
      ? {
          label: 'ปิดใช้งานแทน',
          run: async () => {
            await onChange((old) =>
              saveMaster(
                old,
                {
                  ...(current(old) as Master),
                  active: false,
                  updatedAt: new Date().toISOString(),
                },
                owner,
              ),
            );
            onDone(`ปิดใช้งาน ${label} แล้ว ประวัติเดิมยังครบ`);
          },
        }
      : canArchive
        ? {
            label: 'จัดเก็บโครงการแทน',
            run: async () => {
              await onChange((old) => {
                const before = current(old) as Project;
                const now = new Date().toISOString();
                const after: Project = { ...before, status: 'archived', updatedAt: now };
                return {
                  ...old,
                  projects: old.projects.map((item) => (item.id === after.id ? after : item)),
                  audit: [
                    ...old.audit,
                    {
                      id: crypto.randomUUID(),
                      entityId: after.id,
                      action: 'update',
                      at: now,
                      actor: actorUid(owner),
                      before,
                      after,
                    },
                  ],
                };
              });
              onDone(`จัดเก็บ ${label} แล้ว ประวัติเดิมยังครบ`);
            },
          }
        : undefined;

  return (
    <ConfirmDialog
      title={`ลบ ${label}`}
      message="รายการจะถูกซ่อนจากการใช้งาน โดยเก็บข้อมูลและประวัติไว้ ไม่ลบข้อมูลอื่นตามไปด้วย"
      blockers={blockers}
      disabled={!uploads}
      alternative={alternative}
      onConfirm={confirm}
      onCancel={onCancel}
    >
      {!uploads && !loadError && <p role="status">กำลังตรวจข้อมูลที่อ้างอิง…</p>}
      {loadError && <p role="alert">{loadError}</p>}
      {uploads && !blockers.length && linked.length > 0 && (
        <p>
          คนขับคนนี้ประจำรถ {linked.map((truck) => truck.name).join(', ')} —
          ระบบจะยกเลิกการผูกก่อนลบ ตัวรถยังอยู่
        </p>
      )}
    </ConfirmDialog>
  );
}
