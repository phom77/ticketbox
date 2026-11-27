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
import { applyPreset, venueDate } from '../../features/performance/saleWindowPresets';
import { PerformanceTicketTypeFields } from './PerformanceTicketTypeFields';
import type { OfferDateField, OfferDates } from './performanceSaleReview';

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
  const [existingPool, setExistingPool] = useState('');
  const [earlyBirdError, setEarlyBirdError] = useState({ group: '', message: '' });
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
    const price = admissionPrice;
    const pool = sale.groups.find((group) => group.id === existingPool);
    if (pool) {
      if (!name || !validPrice(price)) return;
      setSale({ ...sale, offers: [...sale.offers, newOffer(pool.id, performance, name, price)] });
      form.reset();
      setAdmissionPrice(0);
      return;
    }
    const capacity = Number(values.get('capacity'));
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

  function addOffer(groupId: string) {
    setSale({ ...sale, offers: [...sale.offers, newOffer(groupId, performance, '', 0)] });
  }

  /** A second ticket type in the same pool that sells at the early price until the middle of the sale. */
  function addEarlyBird(offer: SaleOffer) {
    const middle = new Date(
      (Date.parse(performance.saleStartAt) + Date.parse(performance.saleEndAt)) / 2,
    ).toISOString();
    const result = applyPreset('early', performance, {
      date: venueDate(middle, performance.timezone),
    });
    if (!result.ok) {
      setEarlyBirdError({ group: offer.groupId, message: t('performances:presetEmpty') });
      return;
    }
    setEarlyBirdError({ group: '', message: '' });
    setSale({
      ...sale,
      offers: [
        ...sale.offers,
        {
          ...newOffer(
            offer.groupId,
            performance,
            t('performances:earlyBirdName', { name: offer.name }).trim(),
            offer.price,
          ),
          ...result.window,
          minPerOrder: offer.minPerOrder,
        },
      ],
    });
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

  const poolOptions = sale.groups.map((group, index) => ({
    value: group.id,
    label: groupOptionLabel(group, index),
  }));

  return (
    <>
      {!immutable && (canAddGa || sale.groups.length > 0) && (
        <form
          className="performance-form"
          onSubmit={addAdmission}
          aria-label={t('performances:addGeneralAdmissionTicket')}
        >
          <fieldset className="performance-wide performance-form" disabled={disabled}>
            <legend>{t('performances:addGeneralAdmissionTicket')}</legend>
            {sale.groups.length > 0 && (
              <label>
                {t('performances:sellFromPool')}
                <WorkspaceSelect
                  label={t('performances:sellFromPool')}
                  value={existingPool}
                  onChange={setExistingPool}
                  options={[
                    ...(canAddGa ? [{ value: '', label: t('performances:newPoolOption') }] : []),
                    ...poolOptions,
                  ]}
                />
              </label>
            )}
            {layout && !existingPool && (
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
            {!existingPool && (
              <label>
                {t('performances:capacity')}
                <input name="capacity" type="number" min={1} max={maxCapacity} step={1} required />
                <small>{t('performances:newPoolHelp')}</small>
              </label>
            )}
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
      <section className="performance-sales-advanced" aria-labelledby={`${idPrefix}-stock`}>
        <h4 id={`${idPrefix}-stock`}>{t('performances:inventoryAndPricing')}</h4>
        <p>{t('performances:ticketsAndStockHelp')}</p>
        <details>
          <summary>{t('performances:howPoolsWork')}</summary>
          <p>{t('performances:howPoolsWorkBody')}</p>
        </details>
        <fieldset className="performance-admin performance-sales-fields" disabled={disabled}>
          {immutable && <p>{t('performances:poolFixedAfterRelease')}</p>}
          {sale.groups.map((group, index) => {
            const current = sections.find((section) => section.id === group.sectionId);
            const members = sale.offers.filter((offer) => offer.groupId === group.id);
            return (
              <fieldset className="performance-form performance-pool" key={group.id}>
                <legend>
                  {group.sectionLabel || groupOptionLabel(group, index)} ·{' '}
                  {group.kind === 'ASSIGNED'
                    ? t('performances:seatPool')
                    : t('performances:inventoryGroup')}
                </legend>
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
                {members.length > 1 && (
                  <p className="performance-wide">{t('performances:poolSharedHelp')}</p>
                )}
                <div className="performance-wide performance-admin">
                  {members.map((offer) => (
                    <PerformanceTicketTypeFields
                      key={offer.id}
                      offer={offer}
                      group={group}
                      groups={poolOptions}
                      performance={performance}
                      immutable={immutable}
                      editedDates={editedDates}
                      dateErrors={dateErrors}
                      onChange={(patch) => updateOffer(offer.id, patch)}
                      onDateChange={(field, value) => onDateChange(offer.id, field, value)}
                      onResetDates={() => onResetDates(offer)}
                      onAddEarlyBird={() => addEarlyBird(offer)}
                      onRemove={() =>
                        setSale({
                          ...sale,
                          offers: sale.offers.filter((entry) => entry.id !== offer.id),
                        })
                      }
                    />
                  ))}
                </div>
                {earlyBirdError.group === group.id && (
                  <p role="alert" className="performance-wide">
                    {earlyBirdError.message}
                  </p>
                )}
                {!immutable && (
                  <div className="performance-wide performance-options">
                    <button
                      type="button"
                      className="button button-secondary"
                      onClick={() => addOffer(group.id)}
                    >
                      {t('performances:addTicketTypeToPool')}
                    </button>
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
                      {t('performances:removePool')}
                    </button>
                  </div>
                )}
              </fieldset>
            );
          })}
          {!immutable && canAddGa && sale.groups.length > 0 && (
            <div className="performance-options">
              <button type="button" className="button button-secondary" onClick={addGroup}>
                {t('performances:addGroup')}
              </button>
            </div>
          )}
        </fieldset>
      </section>
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
