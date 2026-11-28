export const pageSize = 50;

/** The current page of a list; the page is clamped when the list shrinks. */
export function paginate<T>(items: T[], page: number, size = pageSize) {
  const pages = Math.max(1, Math.ceil(items.length / size));
  const current = Math.min(Math.max(0, page), pages - 1);
  return { pages, current, items: items.slice(current * size, (current + 1) * size) };
}

export default function Pager({
  page,
  pages,
  total,
  label,
  onPage,
}: {
  page: number;
  pages: number;
  total: number;
  label: string;
  onPage: (page: number) => void;
}) {
  if (pages <= 1) return null;
  return (
    <div className="pager" role="group" aria-label={`เปลี่ยนหน้า${label}`}>
      <button type="button" className="secondary" disabled={!page} onClick={() => onPage(page - 1)}>
        ก่อนหน้า
      </button>
      <span>
        หน้า {page + 1} / {pages} · ทั้งหมด {total} รายการ
      </span>
      <button
        type="button"
        className="secondary"
        disabled={page >= pages - 1}
        onClick={() => onPage(page + 1)}
      >
        ถัดไป
      </button>
    </div>
  );
}
