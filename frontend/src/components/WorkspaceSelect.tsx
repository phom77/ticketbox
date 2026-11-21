import {
  forwardRef, useCallback, useId, useLayoutEffect, useRef, useState, type KeyboardEvent,
} from 'react';
import { createPortal } from 'react-dom';
import { Check, ChevronDown } from 'lucide-react';
import './WorkspaceSelect.css';

export type WorkspaceSelectOption = {
  value: string;
  label: string;
  lang?: string;
  disabled?: boolean;
};

type WorkspaceSelectProps = {
  label: string;
  value: string;
  options: readonly WorkspaceSelectOption[];
  onChange: (value: string) => void;
  name?: string;
  disabled?: boolean;
  required?: boolean;
  invalid?: boolean;
  describedBy?: string;
  placeholder?: string;
  className?: string;
};

export const WorkspaceSelect = forwardRef<HTMLButtonElement, WorkspaceSelectProps>(function WorkspaceSelect({
  label, value, options, onChange, name, disabled, required, invalid, describedBy, placeholder, className,
}, forwardedRef) {
  const popupId = useId();
  const trigger = useRef<HTMLButtonElement | null>(null);
  const listbox = useRef<HTMLUListElement>(null);
  const search = useRef({ term: '', until: 0 });
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);
  const enabled = options.flatMap((option, index) => option.disabled ? [] : [index]);
  const selectedIndex = options.findIndex((option) => option.value === value);
  const selected = options[selectedIndex];
  const unavailable = disabled || enabled.length === 0;
  const expanded = open && !unavailable;
  const activeId = expanded && options[active] && !options[active].disabled ? `${popupId}-${active}` : undefined;
  const setTrigger = useCallback((element: HTMLButtonElement | null) => {
    trigger.current = element;
    if (typeof forwardedRef === 'function') forwardedRef(element);
    else if (forwardedRef) forwardedRef.current = element;
  }, [forwardedRef]);

  useLayoutEffect(() => {
    const anchor = trigger.current;
    const popup = listbox.current;
    if (!expanded || !anchor || !popup) return;

    const viewport = window.visualViewport;
    function position() {
      if (!anchor || !popup) return;
      const bounds = anchor.getBoundingClientRect();
      const width = viewport?.width ?? document.documentElement.clientWidth;
      const height = viewport?.height ?? window.innerHeight;
      const left = viewport?.offsetLeft ?? 0;
      const top = viewport?.offsetTop ?? 0;
      const right = left + width;
      const bottom = top + height;
      const inset = 8;
      const gap = 6;
      const below = bottom - bounds.bottom - gap - inset;
      const above = bounds.top - top - gap - inset;
      const showAbove = below < 240 && above > below;
      const popupWidth = Math.max(0, Math.min(Math.max(208, bounds.width), 520, width - 2 * inset));
      popup.style.width = `${popupWidth}px`;
      popup.style.left = `${Math.max(left + inset, Math.min(bounds.left, right - popupWidth - inset))}px`;
      popup.style.maxHeight = `${Math.max(0, Math.min(336, showAbove ? above : below))}px`;
      popup.style.top = showAbove ? 'auto' : `${bounds.bottom + gap}px`;
      popup.style.bottom = showAbove ? `${window.innerHeight - bounds.top + gap}px` : 'auto';
    }

    function closeOutside(event: PointerEvent) {
      const target = event.target;
      if (target instanceof Node && !anchor?.contains(target) && !popup?.contains(target)) setOpen(false);
    }

    position();
    if ('showPopover' in popup) {
      popup.setAttribute('popover', 'manual');
      popup.showPopover();
    }
    window.addEventListener('resize', position);
    window.addEventListener('scroll', position, true);
    viewport?.addEventListener('resize', position);
    viewport?.addEventListener('scroll', position);
    document.addEventListener('pointerdown', closeOutside, true);
    return () => {
      window.removeEventListener('resize', position);
      window.removeEventListener('scroll', position, true);
      viewport?.removeEventListener('resize', position);
      viewport?.removeEventListener('scroll', position);
      document.removeEventListener('pointerdown', closeOutside, true);
    };
  }, [expanded]);

  useLayoutEffect(() => {
    const popup = listbox.current;
    const option = activeId ? document.getElementById(activeId) : null;
    if (!popup || !option) return;
    const { top, bottom } = option.getBoundingClientRect();
    const bounds = popup.getBoundingClientRect();
    if (top < bounds.top) popup.scrollTop -= bounds.top - top;
    if (bottom > bounds.bottom) popup.scrollTop += bottom - bounds.bottom;
  }, [activeId]);

  function show(index = enabled.includes(selectedIndex) ? selectedIndex : enabled[0]) {
    search.current = { term: '', until: 0 };
    setActive(index);
    setOpen(true);
  }

  function choose(index: number) {
    setOpen(false);
    const option = options[index];
    if (option && !option.disabled && option.value !== value) onChange(option.value);
  }

  function handleKey(event: KeyboardEvent<HTMLButtonElement>) {
    if (unavailable || event.nativeEvent.isComposing) return;
    const current = Math.max(0, enabled.indexOf(active));
    switch (event.key) {
      case 'ArrowDown':
      case 'ArrowUp':
      case 'PageDown':
      case 'PageUp': {
        event.preventDefault();
        if (!expanded) {
          show();
          return;
        }
        if (event.altKey && event.key === 'ArrowUp') {
          choose(active);
          return;
        }
        const jump = event.key.startsWith('Page') ? 10 : 1;
        const offset = event.key.endsWith('Down') ? jump : -jump;
        setActive(enabled[Math.min(enabled.length - 1, Math.max(0, current + offset))]);
        return;
      }
      case 'Home':
      case 'End': {
        event.preventDefault();
        show(event.key === 'Home' ? enabled[0] : enabled[enabled.length - 1]);
        return;
      }
      case 'Enter':
      case ' ':
        event.preventDefault();
        if (expanded) choose(active);
        else show();
        return;
      case 'Escape':
        if (expanded) {
          event.preventDefault();
          event.stopPropagation();
          setOpen(false);
        }
        return;
      case 'Tab':
        if (expanded) choose(active);
        return;
      default:
        if (event.key.length !== 1 || event.altKey || event.metaKey || event.ctrlKey) return;
        event.preventDefault();
        handleTypeahead(event.key);
    }
  }

  function handleTypeahead(key: string) {
    const letter = searchText(key);
    const base = performance.now() < search.current.until ? search.current.term : '';
    const term = base === letter ? letter : base + letter;
    search.current = { term, until: performance.now() + 700 };
    const start = enabled.indexOf(expanded ? active : selectedIndex);
    const offset = term.length === 1 ? 1 : 0;
    const index = enabled.map((_, step) => enabled[(Math.max(start, 0) + step + offset) % enabled.length])
      .find((candidate) => searchText(options[candidate].label).startsWith(term));
    if (index !== undefined) {
      setActive(index);
      setOpen(true);
    }
  }

  return <span className={className ? `workspace-select ${className}` : 'workspace-select'}>
    <button type="button" role="combobox" className="workspace-select-trigger" ref={setTrigger}
      data-value={value} aria-label={label} aria-expanded={expanded} aria-controls={expanded ? popupId : undefined}
      aria-activedescendant={activeId} aria-required={required || undefined} aria-invalid={invalid || undefined}
      aria-describedby={describedBy} disabled={unavailable} onKeyDown={handleKey} onBlur={() => setOpen(false)}
      onClick={() => { if (expanded) setOpen(false); else show(); }}>
      <span className="workspace-select-value" lang={selected?.lang}>{selected?.label ?? placeholder ?? label}</span>
      <ChevronDown size={17} aria-hidden />
    </button>
    {name && <input type="hidden" name={name} value={value} disabled={disabled} />}
    {expanded && createPortal(
      <ul className="workspace-select-popup" id={popupId} role="listbox" aria-label={label} ref={listbox}>
        {options.map((option, index) => <li key={option.value} role="option" id={`${popupId}-${index}`}
          className="workspace-select-option" aria-selected={index === selectedIndex} aria-disabled={option.disabled || undefined}
          data-active={index === active || undefined} data-value={option.value} lang={option.lang}
          onMouseDown={(event) => event.preventDefault()} onClick={() => {
            if (option.disabled) return;
            trigger.current?.focus({ preventScroll: true });
            choose(index);
          }}>
          <span>{option.label}</span>
          {index === selectedIndex && <Check size={17} aria-hidden />}
        </li>)}
      </ul>,
      trigger.current?.closest('dialog, .operations-shell') ?? document.body,
    )}
  </span>;
});

function searchText(value: string) {
  return value.toLocaleLowerCase().normalize('NFD').replace(/\p{M}/gu, '').replace(/đ/g, 'd');
}
