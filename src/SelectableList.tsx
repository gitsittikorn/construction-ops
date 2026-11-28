import { useEffect, useState, type ReactNode } from 'react';
import { bulkDelete, type BulkTarget } from './bulkDelete';
import {
  BulkActionToolbar,
  BulkDeleteDialog,
  BulkResultNotice,
  SelectAllCheckbox,
  SelectBox,
  useBulkOutcome,
} from './BulkSelect';
import { recordUsage, type DeletableType } from './deletion';
import Pager, { paginate } from './Pager';
import type { Entity } from './syncModel';
import { listUploads, type UploadRecord } from './uploads';
import { useBulkSelection } from './useBulkSelection';
import type { Data, Master } from './models';

export interface ListParts<T> {
  rows: T[];
  box: (item: T) => ReactNode;
  selectAll: ReactNode;
  selected: (item: T) => boolean;
}
export interface RecordAccess {
  data: Data;
  owner: string;
  onChange: (change: (data: Data) => Data) => Promise<void>;
}

/**
 * Paging, selection and bulk delete for one list. `access` is omitted for read-only users, who
 * get the same list without checkboxes. `scope` names the current search and filters.
 */
export default function SelectableList<T extends Entity>({
  items,
  scope,
  type,
  label,
  boxLabel = label,
  access,
  headerCheckbox = false,
  children,
}: {
  items: T[];
  scope: string;
  type: DeletableType;
  label: (item: T) => string;
  /** Shorter checkbox name when the full label would repeat other cells of the row. */
  boxLabel?: (item: T) => string;
  access?: RecordAccess;
  /** The list renders `selectAll` itself, for example inside a table header. */
  headerCheckbox?: boolean;
  children: (parts: ListParts<T>) => ReactNode;
}) {
  const [paging, setPaging] = useState({ scope, page: 0 });
  const view = paginate(items, paging.scope === scope ? paging.page : 0);
  const selection = useBulkSelection(
    items.map((item) => item.id),
    scope,
  );
  const result = useBulkOutcome(scope);
  const [targets, setTargets] = useState<BulkTarget[] | null>(null);
  const pageIds = view.items.map((item) => item.id);
  return (
    <>
      {access && result.outcome && (
        <BulkResultNotice outcome={result.outcome} onClose={() => result.set(null)} />
      )}
      {access && (!headerCheckbox || selection.count > 0) && (
        <BulkActionToolbar
          selection={selection}
          pageIds={pageIds}
          onDelete={() => {
            result.set(null);
            setTargets(
              items
                .filter((item) => selection.has(item.id))
                .map((record) => ({ type, record, label: label(record) })),
            );
          }}
        />
      )}
      {children({
        rows: view.items,
        box: (item) =>
          access ? <SelectBox selection={selection} id={item.id} name={boxLabel(item)} /> : null,
        selectAll: access ? <SelectAllCheckbox selection={selection} pageIds={pageIds} /> : null,
        selected: (item) => selection.has(item.id),
      })}
      <Pager
        page={view.current}
        pages={view.pages}
        total={items.length}
        label="รายการ"
        onPage={(page) => setPaging({ scope, page })}
      />
      {access && targets && (
        <RecordBulkDialog
          access={access}
          targets={targets}
          onCancel={() => setTargets(null)}
          onFinish={(outcome) => {
            setTargets(null);
            selection.keep(outcome.failed.map((item) => item.id));
            result.set(outcome);
          }}
        />
      )}
    </>
  );
}

function RecordBulkDialog({
  access: { data, owner, onChange },
  targets,
  onCancel,
  onFinish,
}: {
  access: RecordAccess;
  targets: BulkTarget[];
  onCancel: () => void;
  onFinish: Parameters<typeof BulkDeleteDialog>[0]['onFinish'];
}) {
  const [uploads, setUploads] = useState<UploadRecord[] | null>(null);
  const [loadError, setLoadError] = useState('');
  const [withDrivers, setWithDrivers] = useState(false);
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
  // Drivers assigned to selected trucks are removed only when explicitly ticked.
  const drivers = targets.flatMap(({ record }) => {
    const driver = data.masters.find(
      (item) =>
        item.kind === 'driver' &&
        'kind' in record &&
        record.kind === 'truck' &&
        item.id === (record as Master).driverId,
    );
    return driver && !targets.some((target) => target.record.id === driver.id)
      ? [{ type: 'master' as const, record: driver, label: `คนขับ ${driver.name}` }]
      : [];
  });
  const all = withDrivers ? [...targets, ...drivers] : targets;
  const blocked = uploads
    ? targets.filter(({ type, record }) => recordUsage(data, type, record.id, uploads).length)
    : [];
  return (
    <BulkDeleteDialog
      count={all.length}
      disabled={!uploads}
      onCancel={onCancel}
      onFinish={onFinish}
      onDelete={async () => {
        const files = await listUploads(owner);
        let outcome = {
          deleted: [] as string[],
          failed: [] as { id: string; label: string; reason: string }[],
        };
        await onChange((old) => {
          const result = bulkDelete(old, all, owner, files);
          outcome = result;
          return result.data;
        });
        return outcome;
      }}
    >
      <ul className="bulk-names">
        {all.slice(0, 8).map((target) => (
          <li key={target.record.id}>{target.label}</li>
        ))}
        {all.length > 8 && <li>และอีก {all.length - 8} รายการ</li>}
      </ul>
      {drivers.length > 0 && (
        <label className="checkbox-label">
          <input
            type="checkbox"
            checked={withDrivers}
            onChange={(event) => setWithDrivers(event.target.checked)}
          />
          ลบคนขับประจำรถของรถที่เลือกด้วย ({drivers.length} คน)
        </label>
      )}
      {blocked.length > 0 && (
        <p>
          มี {blocked.length} รายการถูกข้อมูลอื่นอ้างอิง อาจลบไม่ได้และจะแจ้งเหตุผลหลังดำเนินการ
        </p>
      )}
      {!uploads && !loadError && <p role="status">กำลังตรวจข้อมูลที่อ้างอิง…</p>}
      {loadError && <p role="alert">{loadError}</p>}
    </BulkDeleteDialog>
  );
}
