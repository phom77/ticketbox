import { useId, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { ManagedPerformance, SaleGroup, SaleOffer } from '../../api/performanceManagement';
import { MoneyInput } from '../../components/admin/MoneyInput';
import { WorkspaceSelect } from '../../components/WorkspaceSelect';
import {
  applyPreset,
  defaultFinalDays,
  detectPreset,
  maxFinalDays,
  salePresets,
  summarizeWindow,
  venueDate,
  type SalePreset,
  saleOpeningInstant,
} from '../../features/performance/saleWindowPresets';
import { PerformanceDateTimeField } from './PerformanceDateTimeField';
import { resolvePerformanceDateTime, toPerformanceLocalDateTime } from './performanceDateTime';
import { offerDateFields, type OfferDateField, type OfferDates } from './performanceSaleReview';

export const maxDescription = 500;
export const maxMinPerOrder = 100;
const maxPrice = 999_999_999_999;

type Props = {
  offer: SaleOffer;
  group: SaleGroup | undefined;
  groups: { value: string; label: string }[];
  performance: ManagedPerformance;
  immutable: boolean;
  editedDates: OfferDates;
  dateErrors: OfferDates;
  onChange: (patch: Partial<SaleOffer>) => void;
  onDateChange: (field: OfferDateField, value: string) => void;
  onResetDates: () => void;
  onAddEarlyBird: () => void;
  onRemove: () => void;
};

export function PerformanceTicketTypeFields({
  offer,
  group,
  groups,
  performance,
  immutable,
  editedDates,
  dateErrors,
  onChange,
  onDateChange,
  onResetDates,
  onAddEarlyBird,
  onRemove,
}: Props) {
  const { t, i18n } = useTranslation();
  const idPrefix = useId();
  const zone = performance.timezone;
  const saleWindow = performance;
  const edited = editedDates[offer.id];
  const resolved = (field: OfferDateField) => {
    const local = edited?.[field];
    if (local === undefined) return offer[field];
    const result = resolvePerformanceDateTime(local, zone, offer[field]);
    return result.ok && result.instant ? result.instant : offer[field];
  };
  const current = { saleStartAt: resolved('saleStartAt'), saleEndAt: resolved('saleEndAt') };
  const detected = detectPreset(current, saleWindow);
  const [preset, setPreset] = useState<SalePreset>(detected.preset);
  const [days, setDays] = useState(detected.days ?? defaultFinalDays);
  const [earlyDate, setEarlyDate] = useState(
    detected.preset === 'early'
      ? (detected.date ?? '')
      : venueDate(saleOpeningInstant(saleWindow), zone),
  );
  const [laterStart, setLaterStart] = useState(
    detected.preset === 'later'
      ? (detected.date ?? '')
      : toPerformanceLocalDateTime(saleOpeningInstant(saleWindow), zone),
  );
  const [presetError, setPresetError] = useState('');

  const opensAt = toPerformanceLocalDateTime(saleOpeningInstant(performance), zone);
  const closesAt = toPerformanceLocalDateTime(performance.saleEndAt, zone);
  const description = offer.description ?? '';
  // The field keeps what the organizer typed; an unusable value is flagged on blur and blocks saving.
  const [minimumText, setMinimumText] = useState(String(offer.minPerOrder ?? 1));
  const [minimumTouched, setMinimumTouched] = useState(false);
  const typed = /^\d{1,4}$/.test(minimumText.trim()) ? Number(minimumText.trim()) : 0;
  const minimum = typed >= 1 && typed <= maxMinPerOrder ? typed : 0;
  const minimumError =
    minimum === 0
      ? minimumTouched
        ? t('performances:reviewInvalidMinimum')
        : ''
      : minimum > performance.maxPerAccount
        ? t('performances:minPerOrderAboveLimit', { max: performance.maxPerAccount })
        : group && group.capacity > 0 && minimum > group.capacity
          ? t('performances:minPerOrderAboveCapacity', { capacity: group.capacity })
          : '';
  const priceError =
    offer.price < 1 || offer.price > maxPrice ? t('performances:priceRequired') : '';

  function apply(next: SalePreset, input: { date?: string; days?: number }) {
    if (next === 'custom') {
      setPreset('custom');
      setPresetError('');
      return;
    }
    const result = applyPreset(next, saleWindow, input);
    if (!result.ok) {
      setPresetError(
        t(result.reason === 'empty' ? 'performances:presetEmpty' : 'performances:presetInvalid'),
      );
      return;
    }
    setPresetError('');
    setPreset(next);
    onDateChange('saleStartAt', toPerformanceLocalDateTime(result.window.saleStartAt, zone));
    onDateChange('saleEndAt', toPerformanceLocalDateTime(result.window.saleEndAt, zone));
  }

  function choose(next: SalePreset) {
    if (next === 'whole') {
      setPresetError('');
      setPreset('whole');
      onResetDates();
    } else if (next === 'custom') apply(next, {});
    else if (next === 'early') apply(next, { date: earlyDate });
    else if (next === 'final') apply(next, { days });
    else apply(next, { date: laterStart });
  }

  return (
    <fieldset className="performance-form performance-ticket-type">
      <legend>{offer.name || t('performances:offer')}</legend>
      <label>
        {t('performances:name')}
        <input
          value={offer.name}
          maxLength={200}
          onChange={(event) => onChange({ name: event.target.value })}
        />
      </label>
      {groups.length > 1 && (
        <label>
          {t('performances:sellFromPool')}
          <WorkspaceSelect
            label={t('performances:sellFromPool')}
            value={offer.groupId}
            disabled={immutable}
            onChange={(groupId) => onChange({ groupId })}
            options={groups}
          />
          {immutable && <small>{t('performances:poolFixedAfterRelease')}</small>}
        </label>
      )}
      <label>
        {t('performances:price')}
        <MoneyInput
          max={maxPrice}
          value={offer.price}
          aria-invalid={Boolean(priceError) || undefined}
          onValueChange={(price) => onChange({ price })}
        />
        {priceError && <small role="alert">{priceError}</small>}
      </label>
      <label className="performance-inline">
        <input
          type="checkbox"
          checked={offer.active}
          onChange={(event) => onChange({ active: event.target.checked })}
        />
        {t('performances:active')}
      </label>
      <label className="performance-wide">
        {t('performances:ticketTypeDescription')}
        <textarea
          rows={2}
          maxLength={maxDescription}
          value={description}
          placeholder={t('performances:ticketTypeDescriptionPlaceholder')}
          onChange={(event) => onChange({ description: event.target.value || null })}
        />
        <small>
          {t('performances:descriptionCounter', { count: description.length, max: maxDescription })}
        </small>
      </label>
      <label>
        {t('performances:minPerOrder')}
        <input
          type="number"
          inputMode="numeric"
          min={1}
          max={maxMinPerOrder}
          step={1}
          value={minimumText}
          aria-invalid={Boolean(minimumError) || undefined}
          onChange={(event) => {
            setMinimumText(event.target.value);
            const next = /^\d{1,4}$/.test(event.target.value.trim())
              ? Number(event.target.value.trim())
              : 0;
            onChange({ minPerOrder: next >= 1 && next <= maxMinPerOrder ? next : 0 });
          }}
          onBlur={() => setMinimumTouched(true)}
        />
        <small>{minimumError || t('performances:minPerOrderHelp')}</small>
      </label>
      <div className="performance-wide performance-sale-window">
        <label>
          {t('performances:salePreset')}
          <WorkspaceSelect
            label={t('performances:salePreset')}
            value={preset}
            onChange={(value) => choose(value as SalePreset)}
            options={salePresets.map((value) => ({
              value,
              label: t(`performances:preset_${value}`),
            }))}
          />
        </label>
        {preset === 'early' && (
          <PerformanceDateTimeField
            name={`${idPrefix}-early`}
            label={t('performances:presetEarlyEnds')}
            dateOnly
            value={earlyDate}
            min={opensAt}
            max={closesAt}
            onChange={(value) => {
              setEarlyDate(value.slice(0, 10));
              apply('early', { date: value.slice(0, 10) });
            }}
          />
        )}
        {preset === 'final' && (
          <label>
            {t('performances:presetFinalDays')}
            <input
              type="number"
              min={1}
              max={maxFinalDays}
              step={1}
              value={days}
              onChange={(event) => {
                const next = Number(event.target.value);
                setDays(next);
                apply('final', { days: next });
              }}
            />
          </label>
        )}
        {preset === 'later' && (
          <PerformanceDateTimeField
            name={`${idPrefix}-later`}
            label={t('performances:presetStartsOn')}
            value={laterStart}
            timeZone={zone}
            min={opensAt}
            max={closesAt}
            onChange={(value) => {
              setLaterStart(value);
              apply('later', { date: value });
            }}
          />
        )}
        {preset === 'custom' && (
          <div className="performance-form">
            {offerDateFields.map((field) => (
              <PerformanceDateTimeField
                key={field}
                name={`${idPrefix}-${field}`}
                label={t(`performances:${field}`)}
                value={edited?.[field] ?? toPerformanceLocalDateTime(offer[field], zone)}
                timeZone={zone}
                onChange={(value) => onDateChange(field, value)}
                min={opensAt}
                max={closesAt}
                required
                error={dateErrors[offer.id]?.[field]}
              />
            ))}
          </div>
        )}
        {presetError && <p role="alert">{presetError}</p>}
        <p className="performance-sale-window-summary">
          {t('performances:onSaleSummary', {
            window: summarizeWindow(current, zone, i18n.language),
          })}
        </p>
      </div>
      <div className="performance-wide performance-options">
        {!immutable && (
          <button type="button" className="button button-secondary" onClick={onAddEarlyBird}>
            {t('performances:addEarlyBird')}
          </button>
        )}
        {!immutable && (
          <button type="button" className="button button-secondary" onClick={onRemove}>
            {t('performances:remove')}
          </button>
        )}
      </div>
    </fieldset>
  );
}
