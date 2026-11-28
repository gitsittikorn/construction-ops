import { Eye, Pencil, Trash2 } from 'lucide-react';

/** Standard order and styling for record actions: view, edit, delete. */
export default function RowActions({
  name,
  onView,
  onEdit,
  onDelete,
  disabled = false,
}: {
  name: string;
  onView?: () => void;
  onEdit?: () => void;
  onDelete?: () => void;
  disabled?: boolean;
}) {
  return (
    <span className="row-actions">
      {onView && (
        <button
          type="button"
          className="secondary"
          aria-label={`ดูรายละเอียด ${name}`}
          onClick={onView}
        >
          <Eye size={15} aria-hidden="true" /> ดูรายละเอียด
        </button>
      )}
      {onEdit && (
        <button
          type="button"
          className="secondary"
          disabled={disabled}
          aria-label={`แก้ไข ${name}`}
          onClick={onEdit}
        >
          <Pencil size={15} aria-hidden="true" /> แก้ไข
        </button>
      )}
      {onDelete && (
        <button
          type="button"
          className="danger-outline"
          disabled={disabled}
          aria-label={`ลบ ${name}`}
          onClick={onDelete}
        >
          <Trash2 size={15} aria-hidden="true" /> ลบ
        </button>
      )}
    </span>
  );
}
