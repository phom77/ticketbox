import { dateFormatter } from '../../data/formatters';
import { translate } from '../../i18n';
import { useTranslation } from 'react-i18next';
import { useEffect, useMemo, useRef, useState } from 'react';
import { CalendarDays, Check, ChevronDown, MapPin, Search, X } from 'lucide-react';

export type ConcertPickerItem = {
  id: string;
  title: string;
  venueName?: string | null;
  eventDate?: string | null;
  status?: string | null;
};

type ConcertPickerProps<T extends ConcertPickerItem> = {
  concerts: T[];
  value: string;
  onChange: (id: string) => void;
  label?: string;
  placeholder?: string;
  disabled?: boolean;
  allowAll?: boolean;
  allLabel?: string;
  className?: string;
  compact?: boolean;
  selection?: T;
  onSearch?: (query: string) => void;
  searchLabel?: string;
  searching?: boolean;
};

const dateTime = dateFormatter({
  dateStyle: 'medium',
  timeStyle: 'short',
});

function normalize(value: string) {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();
}

function statusLabel(status?: string | null) {
  const labels: Record<string, string> = {
    DRAFT: translate("shared:concertPicker_banNhap"),
    ON_SALE: translate("shared:concertPicker_dangBan"),
    SOLD_OUT: translate("shared:concertPicker_hetVe"),
    COMPLETED: translate("shared:concertPicker_daKetThuc"),
    CANCELLED: translate("shared:concertPicker_daHuy"),
  };
  return status ? (labels[status] ?? status) : '';
}

export function ConcertPicker<T extends ConcertPickerItem>({
  concerts,
  value,
  onChange,
  label = translate("shared:concertPicker_buoiDien"),
  placeholder = translate("shared:concertPicker_chonBuoiDien"),
  disabled = false,
  allowAll = false,
  allLabel = translate("shared:concertPicker_tatCaBuoiDien"),
  className = '',
  compact = false,
  selection,
  onSearch,
  searchLabel = translate("shared:concertPicker_timBuoiDien"),
  searching = false,
}: ConcertPickerProps<T>) {
  useTranslation();
  const rootRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const selected = selection?.id === value ? selection : concerts.find((concert) => concert.id === value) ?? null;

  const filtered = useMemo(() => {
    const keyword = normalize(query.trim());
    if (!keyword || onSearch) return concerts;
    return concerts.filter((concert) =>
      normalize(
        [concert.title, concert.venueName, statusLabel(concert.status)].filter(Boolean).join(' '),
      ).includes(keyword),
    );
  }, [concerts, onSearch, query]);

  useEffect(() => {
    if (!open) return;
    const close = (event: MouseEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', close);
    requestAnimationFrame(() => searchRef.current?.focus());
    return () => document.removeEventListener('mousedown', close);
  }, [open]);

  function choose(id: string) {
    onChange(id);
    setOpen(false);
    updateQuery('');
    triggerRef.current?.focus();
  }

  function updateQuery(next: string) {
    setQuery(next);
    onSearch?.(next);
  }

  return (
    <div onKeyDown={(event) => {
      if (open && event.key === 'Escape') {
        event.stopPropagation();
        setOpen(false);
        triggerRef.current?.focus();
      }
    }} className={`concert-picker ${open ? 'is-open' : ''} ${compact ? 'concert-picker-compact' : ''} ${className}`} ref={rootRef}>
      <span className="concert-picker-label">{label}</span>
      <button
        className="concert-picker-trigger"
        ref={triggerRef}
        aria-label={compact ? label : undefined}
        type="button"
        aria-haspopup={compact ? undefined : 'listbox'}
        aria-expanded={open}
        disabled={disabled}
        onClick={() => setOpen((current) => !current)}
      >
        <span className="concert-picker-main">
          <strong>{selected?.title ?? (allowAll && !value ? allLabel : placeholder)}</strong>
          {!compact && <small>
            {selected
              ? [
                  selected.venueName,
                  selected.eventDate ? dateTime.format(new Date(selected.eventDate)) : null,
                ]
                  .filter(Boolean)
                  .join(' · ')
              : concerts.length
                ? translate("shared:concertPicker_timTheoTenDiaDiemHoacTrang")
                : translate("shared:concertPicker_chuaCoBuoiDienPhuHop")}
          </small>}
        </span>
        {selected?.status ? (
          <span className={`concert-picker-status status-${selected.status.toLowerCase()}`}>
            {statusLabel(selected.status)}
          </span>
        ) : null}
        <ChevronDown aria-hidden="true" size={18} />
      </button>

      {open ? (
        <div className="concert-picker-popover">
          <label className="concert-picker-search">
            <Search aria-hidden="true" size={17} />
            <span className="sr-only">{searchLabel}</span>
            <input
              ref={searchRef}
              type={compact ? 'search' : 'text'}
              value={query}
              onChange={(event) => updateQuery(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter') {
                  event.preventDefault();
                  if (!searching && filtered.length === 1) choose(filtered[0].id);
                }
              }}
              placeholder={translate("shared:concertPicker_timTenDiaDiemTrangThai")}
            />
            {query ? (
              <button type="button" aria-label={translate("shared:concertPicker_xoaTuKhoa")} onClick={() => { updateQuery(''); searchRef.current?.focus(); }}>
                <X size={15} />
              </button>
            ) : null}
          </label>
          <div className="concert-picker-results" role={compact ? undefined : "listbox"} aria-label={compact ? undefined : label}>
            {allowAll ? (
              <button
                className={!value ? 'is-selected' : ''}
                type="button"
                role={compact ? undefined : "option"}
                aria-selected={compact ? undefined : !value}
                onClick={() => choose('')}
              >
                <span className="concert-picker-option-icon">
                  <CalendarDays size={16} />
                </span>
                <span>
                  <strong>{allLabel}</strong>
                  <small>{translate("shared:concertPicker_khongGioiHanTheoBuoiDien")}</small>
                </span>
                {!value ? <Check size={17} /> : null}
              </button>
            ) : null}
            {!searching && filtered.map((concert) => (
              <button
                key={concert.id}
                className={concert.id === value ? 'is-selected' : ''}
                type="button"
                role={compact ? undefined : "option"}
                aria-label={compact ? concert.title : undefined}
                aria-selected={compact ? undefined : concert.id === value}
                onClick={() => choose(concert.id)}
              >
                <span className="concert-picker-option-icon">
                  <CalendarDays size={16} />
                </span>
                <span>
                  <strong>{concert.title}</strong>
                  <small>
                    <MapPin size={12} />
                    {concert.venueName || translate("shared:concertPicker_chuaCoDiaDiem")}
                    {concert.eventDate ? ` · ${dateTime.format(new Date(concert.eventDate))}` : ''}
                  </small>
                </span>
                {concert.id === value ? <Check size={17} /> : null}
              </button>
            ))}
            {!searching && !filtered.length ? (
              <p className="concert-picker-empty">
                {translate("shared:concertPicker_chuaCoBuoiDienPhuHop")}
              </p>
            ) : null}
          </div>
        </div>
      ) : null}
    </div>
  );
}
