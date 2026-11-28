import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Trash2 } from 'lucide-react';
import ConfirmDialog from './ConfirmDialog';
import type { BulkSelection } from './useBulkSelection';

export function SelectBox({
  selection,
  id,
  name,
}: {
  selection: BulkSelection;
  id: string;
  name: string;
}) {
  return (
    // The label is the touch target and keeps the click away from the row behind it.
    <label className="select-box" onClick={(event) => event.stopPropagation()}>
      <input
        type="checkbox"
        aria-label={`เลือก ${name}`}
        checked={selection.has(id)}
        onChange={() => selection.toggle(id)}
      />
    </label>
  );
}

export function SelectAllCheckbox({
  selection,
  pageIds,
}: {
  selection: BulkSelection;
  pageIds: string[];
}) {
  const box = useRef<HTMLInputElement>(null);
  const count = pageIds.filter((id) => selection.has(id)).length;
  const all = pageIds.length > 0 && count === pageIds.length;
  useEffect(() => {
    if (box.current) box.current.indeterminate = !all && count > 0;
  }, [all, count]);
  return (
    <label className="select-box">
      <input
        ref={box}
        type="checkbox"
        aria-label="เลือกทั้งหมดในหน้านี้"
        checked={all}
        disabled={!pageIds.length}
        onChange={() => selection.setMany(pageIds, !all)}
      />
    </label>
  );
}

/** Header row above a list: select the page, then act on the selection. */
export function BulkActionToolbar({
  selection,
  pageIds,
  onDelete,
}: {
  selection: BulkSelection;
  pageIds: string[];
  onDelete: () => void;
}) {
  if (!pageIds.length) return null;
  return (
    <div className="bulk-toolbar" role="group" aria-label="จัดการหลายรายการ">
      <SelectAllCheckbox selection={selection} pageIds={pageIds} />
      {selection.count ? (
        <>
          <b role="status">เลือกแล้ว {selection.count} รายการ</b>
          {selection.count < selection.total && (
            <button type="button" className="secondary" onClick={selection.selectAll}>
              เลือกทั้งหมด {selection.total} รายการตามตัวกรอง
            </button>
          )}
          <button type="button" className="secondary" onClick={selection.clear}>
            ยกเลิกการเลือก
          </button>
          <button type="button" className="danger" onClick={onDelete}>
            <Trash2 size={15} aria-hidden="true" /> ลบ ({selection.count})
          </button>
        </>
      ) : (
        <span>เลือกทั้งหน้า ({pageIds.length} รายการ)</span>
      )}
    </div>
  );
}

export interface BulkOutcome {
  deleted: string[];
  failed: { id: string; label: string; reason: string }[];
}

export function BulkDeleteDialog({
  count,
  onDelete,
  onFinish,
  onCancel,
  disabled,
  children,
}: {
  count: number;
  onDelete: () => Promise<BulkOutcome>;
  onFinish: (outcome: BulkOutcome) => void;
  onCancel: () => void;
  disabled?: boolean;
  children?: ReactNode;
}) {
  return (
    <ConfirmDialog
      title="ยืนยันการลบข้อมูล"
      message={`คุณต้องการลบข้อมูลที่เลือกทั้งหมด ${count} รายการหรือไม่? รายการที่ถูกอ้างอิงอยู่จะไม่ถูกลบ`}
      confirmLabel={`ยืนยันการลบ ${count} รายการ`}
      cancelLabel="ยกเลิก"
      disabled={disabled}
      onCancel={onCancel}
      onConfirm={async () => onFinish(await onDelete())}
    >
      {children}
    </ConfirmDialog>
  );
}

export function BulkResultNotice({
  outcome,
  onClose,
}: {
  outcome: BulkOutcome;
  onClose: () => void;
}) {
  return (
    <div className="alert bulk-result" role="status">
      <div>
        <p>ลบสำเร็จ {outcome.deleted.length} รายการ</p>
        {outcome.failed.length > 0 && (
          <>
            <p>ไม่สามารถลบได้ {outcome.failed.length} รายการ (ยังเลือกค้างไว้)</p>
            <ul>
              {outcome.failed.map((item) => (
                <li key={item.id}>
                  {item.label}: {item.reason}
                </li>
              ))}
            </ul>
          </>
        )}
      </div>
      <button type="button" className="secondary" onClick={onClose}>
        ปิดผลการลบ
      </button>
    </div>
  );
}

export function useBulkOutcome(scope: string) {
  const [state, setState] = useState<{ scope: string; outcome: BulkOutcome } | null>(null);
  return {
    outcome: state?.scope === scope ? state.outcome : null,
    set: (outcome: BulkOutcome | null) => setState(outcome && { scope, outcome }),
  };
}
