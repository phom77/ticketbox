import { useEffect, useRef, useState } from 'react';
import { Check, ChevronDown } from 'lucide-react';

type ActionMenuProps<T extends string> = {
  label: string;
  ariaLabel: string;
  options: Array<{ value: T; label: string; destructive?: boolean }>;
  disabled?: boolean;
  onSelect: (value: T) => void;
};

export function ActionMenu<T extends string>({
  label,
  ariaLabel,
  options,
  disabled,
  onSelect,
}: ActionMenuProps<T>) {
  const rootRef = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!open) return;
    const close = (event: MouseEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, [open]);

  return (
    <div className={`action-menu ${open ? 'is-open' : ''}`} ref={rootRef}>
      <button
        type="button"
        aria-label={ariaLabel}
        aria-haspopup="menu"
        aria-expanded={open}
        disabled={disabled}
        onClick={() => setOpen((current) => !current)}
      >
        {label}
        <ChevronDown aria-hidden="true" size={16} />
      </button>
      {open ? (
        <div className="action-menu-popover" role="menu">
          <span>Chọn trạng thái tiếp theo</span>
          {options.map((option) => (
            <button
              key={option.value}
              className={option.destructive ? 'is-destructive' : ''}
              type="button"
              role="menuitem"
              onClick={() => {
                setOpen(false);
                onSelect(option.value);
              }}
            >
              <Check aria-hidden="true" size={15} />
              {option.label}
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}
