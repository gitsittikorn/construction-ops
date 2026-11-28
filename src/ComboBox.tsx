import { useId, useState } from 'react';
import { searchRank } from './searchOptions';

export interface ComboOption {
  value: string;
  label: string;
  search?: string;
}

// A filter box that can be typed into directly. An empty value means "all".
export default function ComboBox({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: string;
  options: ComboOption[];
  onChange: (value: string) => void;
}) {
  const id = useId();
  const [open, setOpen] = useState(false),
    [query, setQuery] = useState<string | null>(null),
    [active, setActive] = useState(0);
  const selected = options.find((option) => option.value === value)?.label ?? '';
  const matches = options
    .map((option, index) => ({
      ...option,
      index,
      rank: searchRank(`${option.label} ${option.search ?? ''}`, query ?? ''),
    }))
    .filter((option) => Number.isFinite(option.rank))
    .sort((a, b) => a.rank - b.rank || a.index - b.index);
  const items: ComboOption[] = query ? matches : [{ value: '', label: 'ทั้งหมด' }, ...matches];
  function close() {
    setOpen(false);
    setQuery(null);
    setActive(0);
  }
  function choose(next: string) {
    onChange(next);
    close();
  }
  return (
    <div className="combo">
      <label htmlFor={id}>{label}</label>
      <input
        id={id}
        type="text"
        role="combobox"
        autoComplete="off"
        maxLength={200}
        placeholder="ทั้งหมด · พิมพ์เพื่อค้นหา"
        aria-expanded={open}
        aria-controls={`${id}-list`}
        aria-autocomplete="list"
        aria-activedescendant={open && items[active] ? `${id}-${active}` : undefined}
        value={query ?? selected}
        onFocus={(event) => {
          event.target.select();
          setOpen(true);
        }}
        onClick={() => setOpen(true)}
        onBlur={close}
        onChange={(event) => {
          setQuery(event.target.value);
          setActive(0);
          setOpen(true);
          if (!event.target.value) onChange('');
        }}
        onKeyDown={(event) => {
          if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
            event.preventDefault();
            setOpen(true);
            const step = event.key === 'ArrowDown' ? 1 : -1;
            setActive((index) => (items.length ? (index + step + items.length) % items.length : 0));
          } else if (event.key === 'Enter' && open) {
            event.preventDefault();
            if (items[active]) choose(items[active].value);
          } else if (event.key === 'Escape') close();
        }}
      />
      {open && (
        <ul role="listbox" id={`${id}-list`} aria-label={`ตัวเลือก ${label}`}>
          {items.map((item, index) => (
            <li
              key={item.value}
              id={`${id}-${index}`}
              role="option"
              aria-selected={item.value === value}
              data-highlighted={index === active}
              onMouseDown={(event) => event.preventDefault()}
              onClick={() => choose(item.value)}
            >
              {item.label}
            </li>
          ))}
          {!items.length && <li role="status">ไม่พบ ลองคำค้นอื่น</li>}
        </ul>
      )}
    </div>
  );
}
