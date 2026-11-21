import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import {
  getPublication, getSaleDraft, publishPerformance, readLayoutDraft, saveSaleDraft,
  type LayoutDraft, type ManagedPerformance, type Publication, type SaleDraft, type SaleGroup, type Venue,
} from '../../api/performanceManagement';
import { eventPath } from '../../api/performances';
import { PerformanceStaffPanel } from './PerformanceStaffPanel';
import { PerformanceLayoutEditor } from './PerformanceLayoutEditor';
import { PerformanceSeatAssignments } from './PerformanceSeatAssignments';

export function PerformanceWorkspace({ performance, venue, onUpdate }: {
  performance: ManagedPerformance; venue?: Venue; onUpdate: (performance: ManagedPerformance) => void;
}) {
  const { t } = useTranslation();
  const [draft, setDraft] = useState<LayoutDraft | null>(null);
  const [sale, setSale] = useState<SaleDraft | null>(null);
  const [publication, setPublication] = useState<Publication | null>(null);
  const [layoutDirty, setLayoutDirty] = useState(false);
  const [layoutBusy, setLayoutBusy] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const id = performance.id;
  useEffect(() => {
    const controller = new AbortController();
    void Promise.all([readLayoutDraft(id, controller.signal), getSaleDraft(id, controller.signal), getPublication(id, controller.signal)])
      .then(([currentLayout, currentSale, currentPublication]) => {
        if (controller.signal.aborted) return;
        setDraft(currentLayout);
        setSale(currentSale);
        setPublication(currentPublication);
      }).catch((failure) => {
        if (!controller.signal.aborted) setError(failure.message);
      });
    return () => controller.abort();
  }, [id]);

  const immutable = performance.status !== 'DRAFT' || publication?.status === 'ON_SALE';
  const pendingSync = Boolean(publication && publication.status !== 'DRAFT'
    && (!publication.ticketingAcknowledged || !publication.checkinAcknowledged));
  const assignedSections = draft?.layout?.sections.filter((section) => section.kind === 'ASSIGNED') ?? [];
  const saleDisabled = busy || layoutBusy || layoutDirty;
  useEffect(() => {
    if (!pendingSync) return;
    const controller = new AbortController();
    let timer: number | undefined;
    async function refresh() {
      try {
        const status = await getPublication(id, controller.signal);
        if (!controller.signal.aborted) setPublication(status);
      } catch {
        // Retain the last known synchronization state and retry.
      } finally {
        if (!controller.signal.aborted) timer = window.setTimeout(refresh, 4000);
      }
    }
    timer = window.setTimeout(refresh, 3000);
    return () => {
      controller.abort();
      window.clearTimeout(timer);
    };
  }, [id, pendingSync]);

  async function saveSale(publish: boolean) {
    if (!sale || !draft || saleDisabled) return;
    if (sale.groups.some((group) => group.kind === 'ASSIGNED' && group.capacity === 0)) {
      setError(t('performances:emptySeatGroup'));
      setMessage('');
      return;
    }
    setBusy(true);
    setMessage('');
    setError('');
    try {
      const saved = await saveSaleDraft(id, sale);
      setSale(saved);
      if (publish || immutable) {
        const status = immutable ? await getPublication(id) : await publishPerformance(id, saved.version, draft.version);
        setSale({ ...saved, version: status.saleVersion });
        setPublication(status);
        onUpdate({ ...performance, status: status.status, saleVersion: status.saleVersion, layoutVersion: draft.version || null });
        setMessage(t('performances:publicationSubmitted'));
      } else {
        setMessage(t('performances:saved'));
      }
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : t('performances:saveFailed'));
    } finally {
      setBusy(false);
    }
  }

  function acceptLayout(next: LayoutDraft) {
    setDraft(next);
    if (immutable || !next.layout) return;

    const sections = new Map(next.layout.sections.map((section) => [section.id, section]));
    setSale((current) => current && ({
      ...current,
      groups: current.groups.map((group) => {
        const section = group.sectionId ? sections.get(group.sectionId) : undefined;
        if (!section || section.kind !== group.kind) return group;
        if (group.kind === 'GA') return { ...group, sectionLabel: section.label };
        const previous = new Set(group.seats.map((seat) => seat.id));
        const seats = section.rows.flatMap((row) => row.seats.filter((seat) => previous.has(seat.id))
          .map((seat) => ({ id: seat.id, blocked: seat.blocked, rowLabel: row.label, seatLabel: seat.label })));
        return { ...group, sectionLabel: section.label, seats, capacity: seats.filter((seat) => !seat.blocked).length };
      }),
    }));
  }

  async function retryPublication() {
    if (!sale || !draft || busy) return;
    setBusy(true);
    setError('');
    try {
      setPublication(await publishPerformance(id, sale.version, draft.version));
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : t('performances:saveFailed'));
    } finally {
      setBusy(false);
    }
  }

  if (performance.legacyConcertId) {
    return <section className="performance-panel"><Link to={'/organizer/concerts/' + performance.legacyConcertId}>{t('performances:legacyWorkspace')}</Link></section>;
  }

  return <div className="performance-admin">
    {error && <p role="alert">{error}</p>}
    {message && <p role="status">{message}</p>}
    {immutable && <p>{t('performances:layoutLockedAfterPublication')}</p>}
    {(!draft || !sale) ? (!error && <p role="status">{t('performances:loading')}</p>) : <>
      <PerformanceLayoutEditor performance={performance} venue={venue} saved={draft} onSave={acceptLayout}
        onDirtyChange={setLayoutDirty} onBusyChange={setLayoutBusy} readOnly={immutable || busy} />
      <section className="performance-panel" aria-label={t('performances:saleConfig')}>
        <h2>{t('performances:saleConfig')}</h2>
        {layoutDirty && <p role="status">{t('performances:saveLayoutBeforeSale')}</p>}
        <PerformanceSeatAssignments sections={assignedSections} sale={sale} setSale={setSale} performance={performance}
          readOnly={immutable || saleDisabled} />
        <SaleEditor sale={sale} setSale={setSale} draft={draft} performance={performance} immutable={immutable} disabled={saleDisabled} />
        <div className="performance-options">
          {!immutable && <button type="button" className="button button-secondary" disabled={saleDisabled} onClick={() => void saveSale(false)}>{t('performances:saveSale')}</button>}
          <button type="button" className="button button-primary" disabled={saleDisabled} onClick={() => void saveSale(true)}>{immutable ? t('performances:publishRevision') : t('performances:publish')}</button>
        </div>
      </section>
      {publication?.checkinAcknowledged && <PerformanceStaffPanel id={id} />}
      {publication && <section className="performance-panel" aria-label={t('performances:publication')}>
        <h2>{t('performances:publication')}</h2>
        <dl className="publication-status">
          <div><dt>{t('performances:ticketing')}</dt><dd>{t(publication.ticketingAcknowledged ? 'performances:synced' : 'performances:notSynced')}</dd></div>
          <div><dt>{t('performances:checkin')}</dt><dd>{t(publication.checkinAcknowledged ? 'performances:synced' : 'performances:notSynced')}</dd></div>
        </dl>
        {pendingSync && <button type="button" className="button button-secondary" disabled={busy} onClick={() => void retryPublication()}>{t('performances:retryPublication')}</button>}
        {immutable && <p>{t('performances:disruptionSupport')} <span>{t('performances:performanceId')} {performance.id}</span></p>}
        {publication.ticketingAcknowledged && performance.publicVisible && <Link to={eventPath(performance.eventId)}>{t('performances:publicView')}</Link>}
      </section>}
    </>}
  </div>;
}

function SaleEditor({ sale, setSale, draft, performance, immutable, disabled }: {
  sale: SaleDraft; setSale: (sale: SaleDraft) => void; draft: LayoutDraft; performance: ManagedPerformance; immutable: boolean; disabled: boolean;
}) {
  const { t } = useTranslation();
  const sections = draft.layout?.sections ?? [];

  function updateGroup(next: SaleGroup) {
    setSale({ ...sale, groups: sale.groups.map((group) => group.id === next.id ? next : group) });
  }

  function addGroup() {
    const section = sections.find((candidate) => candidate.kind === 'ASSIGNED' || !sale.groups.some((group) => group.sectionId === candidate.id));
    if (sections.length && !section) return;
    const group: SaleGroup = {
      id: window.crypto.randomUUID(), sectionId: section?.id ?? null, sectionLabel: section?.label ?? '',
      kind: section?.kind ?? 'GA', capacity: section?.kind === 'ASSIGNED' ? 0 : 50, seats: [],
    };
    setSale({ ...sale, groups: [...sale.groups, group] });
  }

  function addOffer() {
    if (!sale.groups.length) return;
    setSale({ ...sale, offers: [...sale.offers, {
      id: window.crypto.randomUUID(), groupId: sale.groups[0].id, name: '', price: 100000, currency: 'VND',
      saleStartAt: performance.saleStartAt, saleEndAt: performance.saleEndAt, active: true,
    }] });
  }

  function groupOptionLabel(group: SaleGroup, index: number) {
    const duplicatedLabel = sale.groups.some((other) => other.id !== group.id && other.sectionLabel === group.sectionLabel);
    if (!duplicatedLabel) return group.sectionLabel;
    const names = sale.offers.filter((offer) => offer.groupId === group.id && offer.name.trim()).map((offer) => offer.name);
    return `${group.sectionLabel} · ${names.join(' / ') || t('performances:unnamedInventoryGroup', { index: index + 1 })}`;
  }

  return <fieldset className="performance-admin performance-sales-fields" disabled={disabled}>
    <div className="performance-admin">
      {sale.groups.map((group) => {
        const current = sections.find((section) => section.id === group.sectionId);
        return <fieldset className="performance-form" key={group.id}>
          <legend>{group.sectionLabel || t('performances:inventoryGroup')}</legend>
          {sections.length > 0 && <label>{t('performances:sections')}
            <select disabled={immutable} value={current ? group.sectionId ?? '' : ''} onChange={(event) => {
              const section = sections.find((entry) => entry.id === event.target.value);
              if (section) updateGroup({
                ...group, sectionId: section.id, sectionLabel: section.label,
                kind: section.kind, seats: [], capacity: section.kind === 'GA' ? Math.max(1, group.capacity) : 0,
              });
            }}>
              <option value="">{t('performances:selectSection')}</option>
              {sections.filter((entry) => entry.kind === 'ASSIGNED' || !sale.groups.some((other) => other.id !== group.id && other.sectionId === entry.id))
                .map((entry) => <option key={entry.id} value={entry.id}>{entry.label}</option>)}
            </select>
          </label>}
          {group.sectionId && !current && <p className="performance-wide">{t('performances:inventoryGroupMissingSection')}</p>}
          {group.sectionId === null && <label>{t('performances:name')}<input disabled={immutable} value={group.sectionLabel} onChange={(change) => updateGroup({ ...group, sectionLabel: change.target.value })} /></label>}
          {group.kind === 'GA' && <label>{t('performances:capacity')}
            <input disabled={immutable} type="number" min={1} value={group.capacity} onChange={(event) => updateGroup({ ...group, capacity: Number(event.target.value) })} />
          </label>}
          {group.kind === 'ASSIGNED' && current && <a href="#performance-seat-assignment">
            {t('performances:seatAssignment')} · {t('performances:seatCountValue', { count: group.capacity })}
          </a>}
          {!immutable && <button type="button" className="button button-secondary" onClick={() => setSale({
            ...sale, groups: sale.groups.filter((entry) => entry.id !== group.id), offers: sale.offers.filter((entry) => entry.groupId !== group.id),
          })}>{t('performances:remove')}</button>}
        </fieldset>;
      })}
      {!immutable && <button type="button" className="button button-secondary" onClick={addGroup}>{t('performances:addGroup')}</button>}
    </div>
    <div className="performance-admin">
      {sale.offers.map((offer) => (
        <fieldset key={offer.id} className="performance-form">
          <legend>{offer.name || t('performances:offer')}</legend>
          <label>{t('performances:name')}<input value={offer.name} onChange={(event) => updateOffer(offer.id, { name: event.target.value })} /></label>
          <label>{t('performances:inventoryGroup')}
            <select value={offer.groupId} disabled={immutable} onChange={(event) => updateOffer(offer.id, { groupId: event.target.value })}>
              {sale.groups.map((group, index) => <option key={group.id} value={group.id}>{groupOptionLabel(group, index)}</option>)}
            </select>
          </label>
          <label>{t('performances:price')}<input type="number" min={1} value={offer.price} onChange={(event) => updateOffer(offer.id, { price: Number(event.target.value) })} /></label>
          <label>{t('performances:saleStartAt')}<input value={offer.saleStartAt} onChange={(event) => updateOffer(offer.id, { saleStartAt: event.target.value })} /></label>
          <label>{t('performances:saleEndAt')}<input value={offer.saleEndAt} onChange={(event) => updateOffer(offer.id, { saleEndAt: event.target.value })} /></label>
          <label className="performance-inline"><input type="checkbox" checked={offer.active} onChange={(event) => updateOffer(offer.id, { active: event.target.checked })} />{t('performances:active')}</label>
          {!immutable && <button type="button" className="button button-secondary" onClick={() => setSale({
            ...sale, offers: sale.offers.filter((entry) => entry.id !== offer.id),
          })}>{t('performances:remove')}</button>}
        </fieldset>
      ))}
      <button type="button" className="button button-secondary" disabled={!sale.groups.length} onClick={addOffer}>{t('performances:addOffer')}</button>
    </div>
  </fieldset>;

  function updateOffer(id: string, patch: Partial<SaleDraft['offers'][number]>) {
    setSale({ ...sale, offers: sale.offers.map((entry) => entry.id === id ? { ...entry, ...patch } : entry) });
  }
}
