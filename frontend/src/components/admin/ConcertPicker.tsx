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
}: ConcertPickerProps<T>) {
  useTranslation();
  const rootRef = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const selected = concerts.find((concert) => concert.id === value) ?? null;

  const filtered = useMemo(() => {
    const keyword = normalize(query.trim());
    if (!keyword) return concerts;
    return concerts.filter((concert) =>
      normalize(
        [concert.title, concert.venueName, statusLabel(concert.status)].filter(Boolean).join(' '),
      ).includes(keyword),
    );
  }, [concerts, query]);

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
    setQuery('');
  }

  return (
    <div className={`concert-picker ${open ? 'is-open' : ''} ${className}`} ref={rootRef}>
      <span className="concert-picker-label">{label}</span>
      <button
        className="concert-picker-trigger"
        type="button"
        aria-haspopup="listbox"
        aria-expanded={open}
        disabled={disabled}
        onClick={() => setOpen((current) => !current)}
      >
        <span className="concert-picker-main">
          <strong>{selected?.title ?? (allowAll && !value ? allLabel : placeholder)}</strong>
          <small>
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
          </small>
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
            <span className="sr-only">{translate("shared:concertPicker_timBuoiDien")}</span>
            <input
              ref={searchRef}
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Escape') setOpen(false);
                if (event.key === 'Enter' && filtered.length === 1) choose(filtered[0].id);
              }}
              placeholder={translate("shared:concertPicker_timTenDiaDiemTrangThai")}
            />
            {query ? (
              <button type="button" aria-label={translate("shared:concertPicker_xoaTuKhoa")} onClick={() => setQuery('')}>
                <X size={15} />
              </button>
            ) : null}
          </label>
          <div className="concert-picker-results" role="listbox" aria-label={label}>
            {allowAll ? (
              <button
                className={!value ? 'is-selected' : ''}
                type="button"
                role="option"
                aria-selected={!value}
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
            {filtered.map((concert) => (
              <button
                key={concert.id}
                className={concert.id === value ? 'is-selected' : ''}
                type="button"
                role="option"
                aria-selected={concert.id === value}
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
            {!filtered.length ? (
              <p className="concert-picker-empty">
                {translate("shared:concertPicker_khongTimThayBuoiDienPhuHop")}{query}".
              </p>
            ) : null}
          </div>
        </div>
      ) : null}
    </div>
  );
}
