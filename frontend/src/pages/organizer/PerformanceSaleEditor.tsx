import { WorkspaceSelect } from '../../components/WorkspaceSelect';
import { MoneyInput } from '../../components/admin/MoneyInput';
import { useId, useState, type FormEvent } from 'react';
import { useTranslation } from 'react-i18next';
import type {
  DraftLayout,
  ManagedPerformance,
  SaleDraft,
  SaleGroup,
  SaleOffer,
} from '../../api/performanceManagement';
import { PerformanceDateTimeField } from './PerformanceDateTimeField';
import { toPerformanceLocalDateTime } from './performanceDateTime';

import { offerDateFields, type OfferDateField, type OfferDates } from './performanceSaleReview';

export function PerformanceSaleEditor({
  sale,
  setSale,
  layout,
  performance,
  immutable,
  disabled,
  editedDates,
  dateErrors,
  onDateChange,
  onResetDates,
}: {
  sale: SaleDraft;
  setSale: (sale: SaleDraft) => void;
  layout: DraftLayout | null;
  performance: ManagedPerformance;
  immutable: boolean;
  disabled: boolean;
  editedDates: OfferDates;
  dateErrors: OfferDates;
  onDateChange: (id: string, field: OfferDateField, value: string) => void;
  onResetDates: (offer: SaleOffer) => void;
}) {
  const { t } = useTranslation();
  const idPrefix = useId();
  const [admissionArea, setAdmissionArea] = useState('');
  const [admissionPrice, setAdmissionPrice] = useState(0);
  const opensAt = toPerformanceLocalDateTime(performance.saleStartAt, performance.timezone);
  const closesAt = toPerformanceLocalDateTime(performance.saleEndAt, performance.timezone);
  const sections = layout?.sections ?? [];
  const availableGaSections = sections.filter(
    (section) =>
      section.kind === 'GA' && !sale.groups.some((group) => group.sectionId === section.id),
  );
  const candidate = availableGaSections[0];
  const canAddGa = !layout || Boolean(candidate);

  function addAdmission(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    if (disabled || immutable || !canAddGa) return;
    const values = new FormData(form);
    const name = String(values.get('name') ?? '').trim();
    const capacity = Number(values.get('capacity'));
    const price = admissionPrice;
    const section = availableGaSections.find((entry) => entry.id === values.get('sectionId'));
    if (!name || (layout && !section) || !validCapacity(capacity) || !validPrice(price)) return;
    const id = window.crypto.randomUUID();
    setSale({
      ...sale,
      groups: [
        ...sale.groups,
        {
          id,
          sectionId: section?.id ?? null,
          sectionLabel: section?.label ?? name,
          kind: 'GA',
          capacity,
          seats: [],
        },
      ],
      offers: [...sale.offers, newOffer(id, performance, name, price)],
    });
    form.reset();
    setAdmissionPrice(0);
  }

  function updateGroup(next: SaleGroup) {
    setSale({ ...sale, groups: sale.groups.map((group) => (group.id === next.id ? next : group)) });
  }

  function addGroup() {
    if (!canAddGa) return;
    const group: SaleGroup = {
      id: window.crypto.randomUUID(),
      sectionId: candidate?.id ?? null,
      sectionLabel: candidate?.label ?? '',
      kind: 'GA',
      capacity: 0,
      seats: [],
    };
    setSale({ ...sale, groups: [...sale.groups, group] });
  }

  function addOffer() {
    if (!sale.groups.length) return;
    setSale({ ...sale, offers: [...sale.offers, newOffer(sale.groups[0].id, performance, '', 0)] });
  }

  const offersByGroup = new Map<string, string[]>();
  for (const offer of sale.offers) {
    if (!offer.name.trim()) continue;
    const names = offersByGroup.get(offer.groupId) ?? [];
    names.push(offer.name);
    offersByGroup.set(offer.groupId, names);
  }
  const labels = new Map<string, number>();
  for (const group of sale.groups)
    labels.set(group.sectionLabel, (labels.get(group.sectionLabel) ?? 0) + 1);

  function groupOptionLabel(group: SaleGroup, index: number) {
    const fallback = t('performances:unnamedInventoryGroup', { index: index + 1 });
    if (!group.sectionLabel) return fallback;
    if (labels.get(group.sectionLabel) === 1) return group.sectionLabel;
    return `${group.sectionLabel} · ${offersByGroup.get(group.id)?.join(' / ') || fallback}`;
  }

  return (
    <>
      {!immutable && canAddGa && (
        <form
          className="performance-form"
          onSubmit={addAdmission}
          aria-label={t('performances:addGeneralAdmissionTicket')}
        >
          <fieldset className="performance-wide performance-form" disabled={disabled}>
            <legend>{t('performances:addGeneralAdmissionTicket')}</legend>
            {layout && (
              <label>
                {t('performances:sections')}
                <WorkspaceSelect
                  name="sectionId"
                  label={t('performances:sections')}
                  value={
                    availableGaSections.some((section) => section.id === admissionArea)
                      ? admissionArea
                      : (candidate?.id ?? '')
                  }
                  onChange={setAdmissionArea}
                  required
                  options={availableGaSections.map(({ id, label }) => ({ value: id, label }))}
                />
              </label>
            )}
            <label>
              {t('performances:ticketTypeName')}
              <input name="name" required maxLength={200} pattern={`.*\\S.*`} />
            </label>
            <label>
              {t('performances:capacity')}
              <input name="capacity" type="number" min={1} max={maxCapacity} step={1} required />
            </label>
            <label>
              {t('performances:price')}
              <MoneyInput
                name="price"
                required
                max={maxPrice}
                value={admissionPrice}
                onValueChange={setAdmissionPrice}
              />
            </label>
            <div className="performance-wide performance-options">
              <button className="button button-secondary">
                {t('performances:addGeneralAdmissionTicket')}
              </button>
            </div>
          </fieldset>
        </form>
      )}
      <details
        className="performance-sales-advanced"
        open={sale.offers.length > 0 || sale.groups.length > 0 || immutable || undefined}
      >
        <summary>{t('performances:inventoryAndPricing')}</summary>
        <fieldset className="performance-admin performance-sales-fields" disabled={disabled}>
          <div className="performance-admin">
            {sale.groups.map((group) => {
              const current = sections.find((section) => section.id === group.sectionId);
              return (
                <fieldset className="performance-form" key={group.id}>
                  <legend>{group.sectionLabel || t('performances:inventoryGroup')}</legend>
                  {layout && (
                    <label>
                      {t('performances:sections')}
                      <WorkspaceSelect
                        label={t('performances:sections')}
                        disabled={immutable}
                        value={current ? (group.sectionId ?? '') : ''}
                        placeholder={t('performances:selectSection')}
                        onChange={(value) => {
                          const section = sections.find((entry) => entry.id === value);
                          if (!section || section.id === group.sectionId) return;
                          updateGroup({
                            ...group,
                            sectionId: section.id,
                            sectionLabel: section.label,
                            seats: [],
                            capacity: section.kind === 'GA' ? group.capacity : 0,
                          });
                        }}
                        options={sections
                          .filter(
                            (entry) =>
                              entry.kind === group.kind &&
                              (entry.kind === 'ASSIGNED' ||
                                !sale.groups.some(
                                  (other) => other.sectionId === entry.id && other.id !== group.id,
                                )),
                          )
                          .map(({ id, label }) => ({ value: id, label }))}
                      />
                    </label>
                  )}
                  {layout && !current && (
                    <p className="performance-wide">
                      {t('performances:inventoryGroupMissingSection')}
                    </p>
                  )}
                  {!layout && (
                    <label>
                      {t('performances:name')}
                      <input
                        disabled={immutable}
                        maxLength={200}
                        value={group.sectionLabel}
                        onChange={(change) =>
                          updateGroup({ ...group, sectionLabel: change.target.value })
                        }
                      />
                    </label>
                  )}
                  {group.kind === 'GA' && (
                    <label>
                      {t('performances:capacity')}
                      <input
                        disabled={immutable}
                        type="number"
                        min={1}
                        max={maxCapacity}
                        step={1}
                        value={group.capacity || ''}
                        onChange={(event) =>
                          updateGroup({ ...group, capacity: Number(event.target.value) })
                        }
                      />
                    </label>
                  )}
                  {group.kind === 'ASSIGNED' && current && (
                    <a href="#performance-seat-assignment">
                      {t('performances:seatAssignment')} ·{' '}
                      {t('performances:seatCountValue', { count: group.capacity })}
                    </a>
                  )}
                  {!immutable && (
                    <button
                      type="button"
                      className="button button-secondary"
                      onClick={() =>
                        setSale({
                          ...sale,
                          groups: sale.groups.filter((entry) => entry.id !== group.id),
                          offers: sale.offers.filter((entry) => entry.groupId !== group.id),
                        })
                      }
                    >
                      {t('performances:remove')}
                    </button>
                  )}
                </fieldset>
              );
            })}
            {!immutable && canAddGa && (
              <div className="performance-options">
                <button type="button" className="button button-secondary" onClick={addGroup}>
                  {t('performances:addGroup')}
                </button>
              </div>
            )}
          </div>
          <div className="performance-admin">
            {sale.offers.map((offer) => (
              <fieldset key={offer.id} className="performance-form">
                <legend>{offer.name || t('performances:offer')}</legend>
                <label>
                  {t('performances:name')}
                  <input
                    value={offer.name}
                    maxLength={200}
                    onChange={(event) => updateOffer(offer.id, { name: event.target.value })}
                  />
                </label>
                <label>
                  {t('performances:inventoryGroup')}
                  <WorkspaceSelect
                    label={t('performances:inventoryGroup')}
                    value={offer.groupId}
                    disabled={immutable}
                    onChange={(groupId) => updateOffer(offer.id, { groupId })}
                    options={sale.groups.map((group, index) => ({
                      value: group.id,
                      label: groupOptionLabel(group, index),
                    }))}
                  />
                </label>
                <label>
                  {t('performances:price')}
                  <MoneyInput
                    max={maxPrice}
                    value={offer.price}
                    onValueChange={(price) => updateOffer(offer.id, { price })}
                  />
                </label>
                <label className="performance-inline">
                  <input
                    type="checkbox"
                    checked={offer.active}
                    onChange={(event) => updateOffer(offer.id, { active: event.target.checked })}
                  />
                  {t('performances:active')}
                </label>
                <details
                  className="performance-wide"
                  ref={(element) => {
                    if (element && dateErrors[offer.id]) element.open = true;
                  }}
                >
                  <summary>{t('performances:offerSaleWindow')}</summary>
                  <div className="performance-form">
                    {offerDateFields.map((field) => (
                      <PerformanceDateTimeField
                        key={field}
                        name={`${idPrefix}-${offer.id}-${field}`}
                        label={t(`performances:${field}`)}
                        value={
                          editedDates[offer.id]?.[field] ??
                          toPerformanceLocalDateTime(offer[field], performance.timezone)
                        }
                        onChange={(value) => onDateChange(offer.id, field, value)}
                        min={opensAt}
                        max={closesAt}
                        required
                        error={dateErrors[offer.id]?.[field]}
                      />
                    ))}
                    <div className="performance-wide performance-options">
                      <button
                        type="button"
                        className="button button-secondary"
                        onClick={() => onResetDates(offer)}
                      >
                        {t('performances:usePerformanceSaleWindow')}
                      </button>
                    </div>
                  </div>
                </details>
                {!immutable && (
                  <button
                    type="button"
                    className="button button-secondary"
                    onClick={() =>
                      setSale({
                        ...sale,
                        offers: sale.offers.filter((entry) => entry.id !== offer.id),
                      })
                    }
                  >
                    {t('performances:remove')}
                  </button>
                )}
              </fieldset>
            ))}
            <div className="performance-options">
              <button
                type="button"
                className="button button-secondary"
                disabled={!sale.groups.length}
                onClick={addOffer}
              >
                {t('performances:addOffer')}
              </button>
            </div>
          </div>
        </fieldset>
      </details>
    </>
  );

  function updateOffer(id: string, patch: Partial<SaleOffer>) {
    setSale({
      ...sale,
      offers: sale.offers.map((entry) => (entry.id === id ? { ...entry, ...patch } : entry)),
    });
  }
}

const maxCapacity = 2_147_483_647;
const maxPrice = 999_999_999_999;
const validCapacity = (capacity: number) =>
  Number.isInteger(capacity) && capacity > 0 && capacity <= maxCapacity;
const validPrice = (price: number) => Number.isSafeInteger(price) && price > 0 && price <= maxPrice;

function newOffer(
  groupId: string,
  performance: ManagedPerformance,
  name: string,
  price: number,
): SaleOffer {
  return {
    id: window.crypto.randomUUID(),
    groupId,
    name,
    price,
    currency: 'VND',
    active: true,
    saleStartAt: performance.saleStartAt,
    saleEndAt: performance.saleEndAt,
  };
}
