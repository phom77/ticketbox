import type { ReactNode } from 'react';
import { ArrowRight, Check, Minus, Plus } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { AllInPriceNote } from '../price/AllInPrice';
import { formatPrice } from '../price/price';
import {
  offerNames,
  priceBounds,
  stepperReason,
  stockLevel,
  type OfferRow,
  type SelectionFilters,
  type SortOrder,
} from './selection';

export function FilterBar({
  rows,
  filters,
  maxQuantity,
  onChange,
  accessibleOnly,
  onAccessibleChange,
}: {
  rows: OfferRow[];
  filters: SelectionFilters;
  maxQuantity: number;
  onChange: (next: SelectionFilters) => void;
  accessibleOnly?: boolean;
  onAccessibleChange?: (value: boolean) => void;
}) {
  const { t } = useTranslation('customer');
  const bounds = priceBounds(rows);
  const names = offerNames(rows);
  const number = (value: string) => (value === '' ? null : Math.max(0, Number(value)));
  return (
    <form
      className="ts-filters"
      aria-label={t('customer:ticketSelection_filters')}
      onSubmit={(e) => e.preventDefault()}
    >
      <label>
        {t('customer:ticketSelection_quantity')}
        <select
          value={filters.quantity}
          onChange={(event) => onChange({ ...filters, quantity: Number(event.target.value) })}
        >
          {Array.from({ length: Math.max(1, maxQuantity) }, (_, index) => index + 1).map(
            (value) => (
              <option key={value} value={value}>
                {value}
              </option>
            ),
          )}
        </select>
      </label>
      <label>
        {t('customer:ticketSelection_minPrice')}
        <input
          type="number"
          inputMode="numeric"
          min={0}
          step={1000}
          placeholder={bounds ? String(bounds.min) : undefined}
          value={filters.minPrice ?? ''}
          onChange={(event) => onChange({ ...filters, minPrice: number(event.target.value) })}
        />
      </label>
      <label>
        {t('customer:ticketSelection_maxPrice')}
        <input
          type="number"
          inputMode="numeric"
          min={0}
          step={1000}
          placeholder={bounds ? String(bounds.max) : undefined}
          value={filters.maxPrice ?? ''}
          onChange={(event) => onChange({ ...filters, maxPrice: number(event.target.value) })}
        />
      </label>
      <label>
        {t('customer:ticketSelection_ticketType')}
        <select
          value={filters.offerName}
          onChange={(event) => onChange({ ...filters, offerName: event.target.value })}
        >
          <option value="">{t('customer:ticketSelection_allTypes')}</option>
          {names.map((name) => (
            <option key={name} value={name}>
              {name}
            </option>
          ))}
        </select>
      </label>
      <label>
        {t('customer:ticketSelection_sort')}
        <select
          value={filters.sort}
          onChange={(event) => onChange({ ...filters, sort: event.target.value as SortOrder })}
        >
          <option value="price">{t('customer:ticketSelection_sortPrice')}</option>
          <option value="best">{t('customer:ticketSelection_sortBest')}</option>
        </select>
      </label>
      {onAccessibleChange ? (
        <label className="ts-check">
          <input
            type="checkbox"
            checked={Boolean(accessibleOnly)}
            onChange={(event) => onAccessibleChange(event.target.checked)}
          />
          {t('performances:accessibleOnly')}
        </label>
      ) : null}
    </form>
  );
}

export function Legend({ seats }: { seats?: boolean }) {
  const { t } = useTranslation('customer');
  const items: Array<[string, string]> = [
    ['available', t('customer:ticketSelection_legendAvailable')],
    ['few', t('customer:ticketSelection_legendFew')],
    ['selected', t('customer:ticketSelection_legendSelected')],
    ['sold', t('customer:ticketSelection_legendSold')],
    ...(seats
      ? ([
          ['accessible', t('customer:ticketSelection_legendAccessible')],
          ['restricted', t('customer:ticketSelection_legendRestricted')],
        ] as Array<[string, string]>)
      : []),
  ];
  return (
    <ul className="ts-legend" aria-label={t('customer:ticketSelection_legend')}>
      {items.map(([kind, label]) => (
        <li key={kind}>
          <span className="ts-swatch" data-kind={kind} aria-hidden="true">
            {kind === 'selected' ? <Check size={12} /> : null}
          </span>
          {label}
        </li>
      ))}
    </ul>
  );
}

export function Stepper({
  row,
  quantity,
  busy,
  onAdd,
  onRemove,
}: {
  row: Pick<OfferRow, 'offerName' | 'available' | 'maxPerAccount'>;
  quantity: number;
  busy: boolean;
  onAdd: () => void;
  onRemove: () => void;
}) {
  const { t } = useTranslation('customer');
  const addReason = stepperReason(row, quantity, 'add');
  const canAdd = !busy && addReason === null;
  const canRemove = !busy && quantity > 0;
  const reason =
    addReason === 'soldOut'
      ? t('customer:ticketSelection_reasonSoldOut')
      : addReason === 'limit'
        ? t('customer:ticketSelection_reasonLimit', { count: row.maxPerAccount ?? 0 })
        : null;
  return (
    <div className="ts-stepper">
      <div className="ts-stepper-controls" aria-busy={busy}>
        <button
          type="button"
          aria-label={t('performances:removeOne', { offer: row.offerName })}
          aria-disabled={!canRemove}
          onClick={() => canRemove && onRemove()}
        >
          <Minus size={16} aria-hidden="true" />
        </button>
        <output aria-live="polite">{quantity}</output>
        <button
          type="button"
          aria-label={t('performances:addOne', { offer: row.offerName })}
          aria-disabled={!canAdd}
          onClick={() => canAdd && onAdd()}
        >
          <Plus size={16} aria-hidden="true" />
        </button>
      </div>
      {row.maxPerAccount != null ? (
        <small>{t('customer:ticketSelection_maxPerAccount', { count: row.maxPerAccount })}</small>
      ) : null}
      {reason ? <small className="ts-reason">{reason}</small> : null}
    </div>
  );
}

export function OfferRowView({
  row,
  selected,
  children,
}: {
  row: OfferRow;
  selected: boolean;
  children: ReactNode;
}) {
  const { t } = useTranslation('customer');
  const level = stockLevel(row.available);
  return (
    <li className="ts-row" data-selected={selected} data-stock={level}>
      <div className="ts-row-info">
        <strong>{row.sectionLabel}</strong>
        {row.offerName !== row.sectionLabel ? <span>{row.offerName}</span> : null}
        <span className="ts-row-price">{formatPrice(row.price)}</span>
        <span className="ts-row-stock" data-stock={level}>
          {level === 'sold'
            ? t('customer:ticketSelection_soldOut')
            : level === 'few'
              ? t('customer:ticketSelection_fewLeft', { count: row.available })
              : t('customer:ticketSelection_available', { count: row.available })}
        </span>
      </div>
      <div className="ts-row-action">{children}</div>
    </li>
  );
}

export type SummaryItem = {
  key: string;
  title: string;
  detail: string;
  price: number;
  onRemove?: () => void;
};

export function SelectionSummary({
  items,
  total,
  wanted,
  held,
  timer,
  heldUntil,
  busy,
  continueDisabled,
  onContinue,
  onLeave,
  leaving,
  notice,
}: {
  items: SummaryItem[];
  total: number | null;
  wanted: number;
  held: number;
  timer: ReactNode;
  heldUntil?: string | null;
  busy: boolean;
  continueDisabled: boolean;
  onContinue: () => void;
  onLeave: () => void;
  leaving: boolean;
  notice?: ReactNode;
}) {
  const { t } = useTranslation('customer');
  return (
    <aside
      className="ts-summary purchase-panel"
      aria-label={t('customer:ticketSelection_summary')}
      aria-busy={busy}
    >
      <h2>{t('customer:ticketSelection_summary')}</h2>
      {timer}
      {heldUntil ? (
        <p className="ts-held-until">
          {t('customer:ticketSelection_heldUntil', { time: heldUntil })}
        </p>
      ) : null}
      {items.length ? (
        <ul className="ts-held">
          {items.map((item) => (
            <li key={item.key}>
              <div>
                <strong>{item.title}</strong>
                <span>{item.detail}</span>
              </div>
              <span className="ts-held-price">{formatPrice(item.price)}</span>
              {item.onRemove ? (
                <button
                  type="button"
                  className="button button-secondary"
                  disabled={busy || leaving}
                  aria-label={t('customer:ticketSelection_removeItem', {
                    item: item.title + ' ' + item.detail,
                  })}
                  onClick={item.onRemove}
                >
                  {t('performances:remove')}
                </button>
              ) : null}
            </li>
          ))}
        </ul>
      ) : (
        <p>{t('customer:ticketSelection_nothingHeld')}</p>
      )}
      {wanted > 1 ? (
        <p className="ts-wanted" role="status">
          {t('customer:ticketSelection_wantedProgress', { held, wanted })}
        </p>
      ) : null}
      {notice}
      <div className="purchase-action-bar">
        <div className="purchase-seat-total">
          <span>{t('customer:ticketSelection_ticketCount', { count: held })}</span>
          <strong aria-live="polite">
            {total == null ? t('customer:ticketSelection_totalUnavailable') : formatPrice(total)}
          </strong>
          <AllInPriceNote />
        </div>
        <button
          className="button button-primary"
          type="button"
          disabled={continueDisabled}
          onClick={onContinue}
        >
          {t('customer:ticketSelection_continue')} <ArrowRight size={17} aria-hidden="true" />
        </button>
      </div>
      <button
        className="button button-secondary ts-leave"
        type="button"
        disabled={leaving}
        onClick={onLeave}
      >
        {t(leaving ? 'ticketSelection_leaving' : 'ticketSelection_leave')}
      </button>
    </aside>
  );
}
