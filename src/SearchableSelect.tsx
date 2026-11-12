import {
  useEffect,
  useLayoutEffect,
  useId,
  useRef,
  useState,
  type SelectHTMLAttributes,
} from 'react';
import { createPortal } from 'react-dom';
import { searchRank } from './searchOptions';

// Keep the native select as the form control, including required, reset and ID values.
// Pointer/keyboard interaction opens an accessible, searchable option picker.
export default function SearchableSelect(props: SelectHTMLAttributes<HTMLSelectElement>) {
  const select = useRef<HTMLSelectElement>(null),
    popup = useRef<HTMLDivElement>(null);
  const search = useRef<HTMLInputElement>(null),
    id = useId();
  const [open, setOpen] = useState(false),
    [query, setQuery] = useState('');
  const [active, setActive] = useState(0);
  const [items, setItems] = useState<
    { index: number; value: string; label: string; disabled: boolean; search: string }[]
  >([]);
  useLayoutEffect(() => {
    if (!open || !select.current) return;
    setItems(
      Array.from(select.current.options).map((option, index) => ({
        index,
        value: option.value,
        label: option.text,
        disabled:
          option.disabled ||
          (option.parentElement instanceof HTMLOptGroupElement && option.parentElement.disabled),
        search: `${option.text} ${option.dataset.search ?? ''}`,
      })),
    );
  }, [open, props.children]);
  const options = items
    .map((option) => ({ ...option, rank: searchRank(option.search, query) }))
    .filter((option) => Number.isFinite(option.rank))
    .sort((a, b) => a.rank - b.rank || a.index - b.index);
  const enabled = options.filter((option) => !option.disabled);
  function close(focus = false) {
    setOpen(false);
    if (focus) select.current?.focus();
  }
  function show(text = '') {
    if (props.disabled) return;
    setQuery(text);
    setActive(0);
    setOpen(true);
  }
  function choose(index: number) {
    const element = select.current;
    if (!element || element.options[index]?.disabled) return;
    element.selectedIndex = index;
    element.dispatchEvent(new Event('change', { bubbles: true }));
    close(true);
  }
  useEffect(() => {
    if (!open) return;
    const control = select.current!,
      panel = popup.current!;
    function position() {
      const rect = control.getBoundingClientRect();
      const width = Math.min(Math.max(rect.width, 280), window.innerWidth - 16);
      panel.style.width = `${width}px`;
      panel.style.left = `${Math.max(8, Math.min(rect.left, window.innerWidth - width - 8))}px`;
      const below = window.innerHeight - rect.bottom - 8;
      const above = rect.top - 8;
      panel.style.maxHeight = `${Math.max(100, Math.min(360, Math.max(below, above)))}px`;
      panel.style.top = below >= Math.min(300, above) ? `${rect.bottom + 4}px` : '';
      panel.style.bottom =
        below >= Math.min(300, above) ? '' : `${window.innerHeight - rect.top + 4}px`;
    }
    position();
    search.current?.focus();
    function outside(event: PointerEvent) {
      if (!panel.contains(event.target as Node) && event.target !== control) setOpen(false);
    }
    document.addEventListener('pointerdown', outside, true);
    window.addEventListener('resize', position);
    window.addEventListener('scroll', position, true);
    return () => {
      document.removeEventListener('pointerdown', outside, true);
      window.removeEventListener('resize', position);
      window.removeEventListener('scroll', position, true);
    };
  }, [open]);
  useEffect(() => {
    popup.current
      ?.querySelector('[data-highlighted="true"]')
      ?.scrollIntoView?.({ block: 'nearest' });
  }, [active, query]);
  return (
    <>
      <select
        {...props}
        ref={select}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={open ? `${id}-list` : undefined}
        onChange={(event) => {
          props.onChange?.(event);
          setOpen(false);
        }}
        onMouseDown={(event) => {
          props.onMouseDown?.(event);
          if (event.button === 0 && !event.defaultPrevented) {
            event.preventDefault();
            show();
          }
        }}
        onKeyDown={(event) => {
          props.onKeyDown?.(event);
          if (event.defaultPrevented || event.ctrlKey || event.metaKey || event.altKey) return;
          if (['ArrowDown', 'ArrowUp', 'Enter', ' '].includes(event.key)) {
            event.preventDefault();
            show();
          } else if (event.key.length === 1) {
            event.preventDefault();
            show(event.key);
          }
        }}
      />
      {open &&
        createPortal(
          <div
            className="search-select-popup"
            ref={popup}
            onKeyDown={(event) => {
              if (event.key === 'Escape') {
                event.stopPropagation();
                event.preventDefault();
                close(true);
              }
              if (event.key === 'Tab') close();
            }}
          >
            <input
              ref={search}
              type="search"
              maxLength={200}
              aria-label="ค้นหาตัวเลือก"
              placeholder="พิมพ์ชื่อ ทะเบียน หรือคำใกล้เคียง…"
              role="combobox"
              aria-expanded="true"
              aria-autocomplete="list"
              aria-controls={`${id}-list`}
              aria-activedescendant={enabled[active] ? `${id}-${enabled[active].index}` : undefined}
              value={query}
              onChange={(event) => {
                setQuery(event.target.value);
                setActive(0);
              }}
              onKeyDown={(event) => {
                if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
                  event.preventDefault();
                  setActive((index) =>
                    enabled.length
                      ? (index + (event.key === 'ArrowDown' ? 1 : -1) + enabled.length) %
                        enabled.length
                      : 0,
                  );
                }
                if (event.key === 'Enter') {
                  event.preventDefault();
                  if (enabled[active]) choose(enabled[active].index);
                }
              }}
            />
            <div role="listbox" id={`${id}-list`} aria-label="ตัวเลือกที่ค้นพบ">
              {options.map((option) => (
                <button
                  key={option.index}
                  id={`${id}-${option.index}`}
                  type="button"
                  role="option"
                  tabIndex={-1}
                  disabled={option.disabled}
                  aria-selected={option.value === select.current?.value}
                  data-highlighted={enabled[active]?.index === option.index}
                  onMouseDown={(event) => event.preventDefault()}
                  onClick={() => choose(option.index)}
                >
                  {option.label}
                </button>
              ))}
              {!options.length && <p role="status">ไม่พบตัวเลือก ลองคำค้นอื่น</p>}
            </div>
          </div>,
          document.body,
        )}
    </>
  );
}
