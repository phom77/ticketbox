import { useEffect, useId, useRef, useState } from 'react';
import { SlidersHorizontal, X } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import type { DiscoveryFacets } from '../../api/performances';
import {
  capitalize,
  dateOptions,
  priceOptions,
  statusOptions,
  type DiscoveryFilters,
} from './filters';

function withCurrent(values: string[], current: string) {
  return current && !values.includes(current) ? [current, ...values] : values;
}

/**
 * Sticky filter bar. Changes apply immediately; below 760px the same fields open as a bottom sheet.
 */
export function DiscoveryFilterPanel({
  filters,
  facets,
  count,
  onApply,
}: {
  filters: DiscoveryFilters;
  facets: DiscoveryFacets;
  count: number;
  onApply: (filters: Partial<DiscoveryFilters>) => void;
}) {
  const { t } = useTranslation('public');
  const sheetId = useId();
  const [open, setOpen] = useState(false);
  const [pickingDates, setPickingDates] = useState(false);
  const trigger = useRef<HTMLButtonElement>(null);
  const showDates = filters.date === 'custom' || pickingDates;

  useEffect(() => {
    if (!open) return;
    const close = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      setOpen(false);
      trigger.current?.focus();
    };
    document.addEventListener('keydown', close);
    return () => document.removeEventListener('keydown', close);
  }, [open]);

  function chooseDate(value: DiscoveryFilters['date']) {
    setPickingDates(value === 'custom');
    if (value === 'custom') return;
    onApply({ date: value, from: '', to: '' });
  }

  function changeRange(next: { from?: string; to?: string }) {
    const from = next.from ?? filters.from;
    const to = next.to ?? filters.to;
    onApply({ date: from || to ? 'custom' : '', from, to });
    if (!from && !to) setPickingDates(false);
  }

  const select = (
    name: 'city' | 'category' | 'price' | 'status',
    label: string,
    anyLabel: string,
    options: Array<[string, string]>,
  ) => (
    <label>
      <span>{label}</span>
      <select
        name={name}
        value={filters[name]}
        onChange={(event) => onApply({ [name]: event.target.value })}
      >
        <option value="">{anyLabel}</option>
        {options.map(([value, text]) => (
          <option key={value} value={value}>
            {text}
          </option>
        ))}
      </select>
    </label>
  );
  const active = ['date', 'status', 'city', 'category', 'price'].filter(
    (key) => filters[key as keyof DiscoveryFilters],
  ).length;

  return (
    <div className="discovery-bar" data-open={open ? 'true' : undefined}>
      <button
        ref={trigger}
        type="button"
        className="button button-secondary discovery-filter-trigger"
        aria-expanded={open}
        aria-controls={sheetId}
        onClick={() => setOpen((value) => !value)}
      >
        <SlidersHorizontal aria-hidden="true" />
        {t('public:discovery_filters')}
        {active > 0 ? <span className="discovery-filter-count">{active}</span> : null}
      </button>
      <div className="discovery-bar-backdrop" aria-hidden="true" onClick={() => setOpen(false)} />
      <div
        id={sheetId}
        className="discovery-bar-sheet"
        role={open ? 'dialog' : undefined}
        aria-label={t('public:discovery_filters')}
      >
        <div className="discovery-bar-sheet-head">
          <strong>{t('public:discovery_filters')}</strong>
          <button
            type="button"
            className="discovery-bar-close"
            aria-label={t('public:discovery_closeFilters')}
            onClick={() => {
              setOpen(false);
              trigger.current?.focus();
            }}
          >
            <X aria-hidden="true" />
          </button>
        </div>
        <form className="discovery-filter-fields" onSubmit={(event) => event.preventDefault()}>
          {select(
            'city',
            t('public:discovery_city'),
            t('public:discovery_anyCity'),
            withCurrent(facets.cities, filters.city).map((value) => [value, value]),
          )}
          {select(
            'category',
            t('public:discovery_category'),
            t('public:discovery_anyCategory'),
            withCurrent(facets.categories, filters.category).map((value) => [
              value,
              capitalize(value),
            ]),
          )}
          {select(
            'price',
            t('public:discovery_price'),
            t('public:discovery_anyPrice'),
            Object.entries(priceOptions)
              .filter(([value]) => value)
              .map(([value, label]) => [value, t(label)]),
          )}
          {select(
            'status',
            t('public:discovery_saleStatus'),
            t('public:discovery_anyStatus'),
            Object.entries(statusOptions)
              .filter(([value]) => value)
              .map(([value, label]) => [value, t(label)]),
          )}
          <fieldset className="discovery-dates">
            <legend>{t('public:discovery_eventDate')}</legend>
            <div className="discovery-date-chips">
              {Object.entries(dateOptions).map(([value, label]) => {
                const pressed =
                  value === 'custom' ? showDates : !showDates && filters.date === value;
                return (
                  <button
                    key={value || 'any'}
                    type="button"
                    aria-pressed={pressed}
                    onClick={() => chooseDate(value as DiscoveryFilters['date'])}
                  >
                    {t(label)}
                  </button>
                );
              })}
            </div>
            {showDates ? (
              <div className="discovery-date-range">
                <label>
                  <span>{t('public:discovery_startDate')}</span>
                  <input
                    type="date"
                    name="from"
                    value={filters.from}
                    max={filters.to || undefined}
                    onChange={(event) => changeRange({ from: event.target.value })}
                  />
                </label>
                <label>
                  <span>{t('public:discovery_endDate')}</span>
                  <input
                    type="date"
                    name="to"
                    value={filters.to}
                    min={filters.from || undefined}
                    onChange={(event) => changeRange({ to: event.target.value })}
                  />
                </label>
              </div>
            ) : null}
          </fieldset>
        </form>
        <button
          type="button"
          className="button button-primary discovery-bar-done"
          onClick={() => {
            setOpen(false);
            trigger.current?.focus();
          }}
        >
          {t('public:discovery_showResults', { count })}
        </button>
      </div>
    </div>
  );
}
