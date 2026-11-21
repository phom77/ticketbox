import { useState, type FormEvent } from 'react';
import { SlidersHorizontal } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import {
  dateOptions, previewCategoryOptions, previewCityOptions, previewPriceOptions, statusOptions, type DiscoveryFilters,
} from './filters';

export function DiscoveryFilterPanel({
  filters, isPreview, onApply,
}: {
  filters: DiscoveryFilters;
  isPreview: boolean;
  onApply: (filters: Partial<DiscoveryFilters>) => void;
}) {
  const { t } = useTranslation('public');
  const [date, setDate] = useState(filters.date);
  const [from, setFrom] = useState(filters.from);
  const [to, setTo] = useState(filters.to);

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const fields = new FormData(event.currentTarget);
    const custom = date === 'custom' && (from || to);
    onApply({
      date: date === 'custom' && !custom ? '' : date,
      from: custom ? from : '',
      to: custom ? to : '',
      status: fields.get('status') as DiscoveryFilters['status'],
      ...(isPreview ? {
        city: fields.get('city') as DiscoveryFilters['city'],
        category: fields.get('category') as DiscoveryFilters['category'],
        price: fields.get('price') as DiscoveryFilters['price'],
      } : {}),
    });
    const disclosure = event.currentTarget.closest('details');
    if (disclosure) disclosure.open = false;
  }

  return (
    <form className="discovery-filter-fields" onSubmit={submit}>
      <label>
        <span>{t('public:discovery_eventDate')}</span>
        <select name="date" value={date} onChange={(event) => setDate(event.target.value as DiscoveryFilters['date'])}>
          {Object.entries(dateOptions).map(([value, label]) => <option key={value} value={value}>{t(label)}</option>)}
        </select>
      </label>
      <label>
        <span>{t('public:discovery_saleStatus')}</span>
        <select name="status" defaultValue={filters.status}>
          {Object.entries(statusOptions).map(([value, label]) => <option key={value} value={value}>{t(label)}</option>)}
        </select>
      </label>
      {date === 'custom' ? (
        <>
          <label>
            <span>{t('public:discovery_startDate')}</span>
            <input type="date" name="from" value={from} max={to || undefined} onChange={(event) => setFrom(event.target.value)} />
          </label>
          <label>
            <span>{t('public:discovery_endDate')}</span>
            <input type="date" name="to" value={to} min={from || undefined} onChange={(event) => setTo(event.target.value)} />
          </label>
        </>
      ) : null}
      {isPreview ? (
        <>
          <label>
            <span>{t('public:discovery_city')}</span>
            <select name="city" defaultValue={filters.city}>
              {Object.entries(previewCityOptions).map(([value, label]) => <option key={value} value={value}>{t(label)}</option>)}
            </select>
          </label>
          <label>
            <span>{t('public:discovery_category')}</span>
            <select name="category" defaultValue={filters.category}>
              {Object.entries(previewCategoryOptions).map(([value, label]) => <option key={value} value={value}>{t(label)}</option>)}
            </select>
          </label>
          <label>
            <span>{t('public:discovery_price')}</span>
            <select name="price" defaultValue={filters.price}>
              {Object.entries(previewPriceOptions).map(([value, label]) => <option key={value} value={value}>{t(label)}</option>)}
            </select>
          </label>
        </>
      ) : null}
      <button type="submit" className="button button-primary">{t('public:discovery_applyFilters')}</button>
    </form>
  );
}

export function DiscoveryFilterTrigger({ count }: { count: number }) {
  const { t } = useTranslation('public');
  return (
    <summary className="button button-secondary discovery-filter-trigger">
      <SlidersHorizontal aria-hidden="true" />
      {t('public:discovery_filters')}
      {count > 0 ? <span className="discovery-filter-count">{count}</span> : null}
    </summary>
  );
}
