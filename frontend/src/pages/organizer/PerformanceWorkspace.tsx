import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import {
  getPublication, getSaleDraft, publishPerformance, readLayoutDraft, saveSaleDraft,
  type LayoutDraft, type ManagedEvent, type ManagedPerformance, type Publication, type SaleDraft, type SaleOffer, type Venue,
} from '../../api/performanceManagement';
import { ApiClientError } from '../../api/client';
import { eventPath } from '../../api/performances';
import { currency, numberFormatter } from '../../data/formatters';
import { PerformanceStaffPanel } from './PerformanceStaffPanel';
import { PerformanceLayoutEditor } from './PerformanceLayoutEditor';
import { PerformanceSeatAssignments } from './PerformanceSeatAssignments';
import { PerformanceSaleEditor } from './PerformanceSaleEditor';
import { formatPerformanceDateTime, resolvePerformanceDateTime } from './performanceDateTime';
import { inspectSaleDraft, offerDateFields, type OfferDateField, type OfferDates } from './performanceSaleReview';

const number = numberFormatter();

export function PerformanceWorkspace({
  event, performance, venue, stage, onUpdate, onReview, onEdit, onDirtyChange, onBusyChange, onEditSchedule, onReload,
}: {
  event: ManagedEvent;
  performance: ManagedPerformance;
  venue?: Venue;
  stage: 'tickets' | 'review';
  onUpdate: (performance: ManagedPerformance) => void;
  onReview: () => void;
  onEdit: () => void;
  onReload: () => void;
  onDirtyChange?: (dirty: boolean) => void;
  onBusyChange?: (busy: boolean) => void;
  onEditSchedule?: () => void;
}) {
  const { t } = useTranslation('performances');
  const [draft, setDraft] = useState<LayoutDraft | null>(null);
  const [sale, setSale] = useState<SaleDraft | null>(null);
  const [publication, setPublication] = useState<Publication | null>(null);
  const [layoutDirty, setLayoutDirty] = useState(false);
  const [layoutBusy, setLayoutBusy] = useState(false);
  const [saleDirty, setSaleDirty] = useState(false);
  const [mapOpen, setMapOpen] = useState<boolean | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [conflict, setConflict] = useState(false);
  const [message, setMessage] = useState('');
  const [reload, setReload] = useState(0);
  const [editedDates, setEditedDates] = useState<OfferDates>({});
  const [dateErrors, setDateErrors] = useState<OfferDates>({});
  const workInProgress = useRef(false);
  const errorNotice = useRef<HTMLParagraphElement>(null);
  const id = performance.id;
  const legacy = Boolean(performance.legacyConcertId);

  useEffect(() => {
    if (legacy) return;
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
  }, [id, legacy, reload]);

  const status = publication?.status ?? performance.status;
  const immutable = status !== 'DRAFT';
  const canRevise = status === 'ON_SALE';
  const pendingSync = Boolean(publication && immutable
    && (!publication.ticketingAcknowledged || !publication.checkinAcknowledged));
  const assignedSections = draft?.layout?.sections.filter((section) => section.kind === 'ASSIGNED') ?? [];
  const saving = busy || layoutBusy;
  const dirty = layoutDirty || saleDirty;
  const saleDisabled = saving || layoutDirty;

  useEffect(() => {
    onDirtyChange?.(dirty);
    onBusyChange?.(saving);
  }, [dirty, onDirtyChange, onBusyChange, saving]);

  useEffect(() => {
    if (!pendingSync) return;
    const controller = new AbortController();
    let timer: number | undefined;
    async function refresh() {
      try {
        const result = await getPublication(id, controller.signal);
        if (!controller.signal.aborted) setPublication(result);
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

  function replaceSale(next: SaleDraft) {
    setSale(next);
    setSaleDirty(true);
    setError('');
    setMessage('');
  }

  function editOfferDate(offerId: string, field: OfferDateField, value: string) {
    setEditedDates((dates) => ({ ...dates, [offerId]: { ...dates[offerId], [field]: value } }));
    setDateErrors((errors) => {
      const fields = { ...errors[offerId], [field]: undefined };
      return { ...errors, [offerId]: Object.values(fields).some(Boolean) ? fields : undefined };
    });
    setSaleDirty(true);
    setError('');
    setMessage('');
  }

  function resetOfferDates(offer: SaleOffer) {
    if (!sale) return;
    setEditedDates((current) => ({ ...current, [offer.id]: undefined }));
    setDateErrors((current) => ({ ...current, [offer.id]: undefined }));
    replaceSale({
      ...sale, offers: sale.offers.map((entry) => entry.id === offer.id ? {
        ...entry, saleStartAt: performance.saleStartAt, saleEndAt: performance.saleEndAt,
      } : entry),
    });
  }

  function reportError(error: string) {
    setError(error);
    window.requestAnimationFrame(() => errorNotice.current?.focus());
  }

  async function run(operation: () => Promise<void>) {
    if (workInProgress.current) return;
    workInProgress.current = true;
    setBusy(true);
    setError('');
    setConflict(false);
    setMessage('');
    try {
      await operation();
    } catch (failure) {
      setConflict(failure instanceof ApiClientError && failure.status === 409);
      reportError(failure instanceof Error ? failure.message : t('performances:saveFailed'));
    } finally {
      workInProgress.current = false;
      setBusy(false);
    }
  }

  async function saveSale(review: boolean) {
    if (!sale || !draft || saleDisabled || (immutable && !canRevise)) return;
    if (!saleDirty) {
      if (review) onReview();
      return;
    }

    const errors: OfferDates = {};
    const starts = Date.parse(performance.saleStartAt);
    const ends = Date.parse(performance.saleEndAt);
    const offers = sale.offers.map((offer) => {
      const edited = editedDates[offer.id];
      const updated = { ...offer };
      for (const field of offerDateFields) {
        const value = edited?.[field];
        if (value === undefined) continue;
        const resolved = resolvePerformanceDateTime(value, performance.timezone, offer[field]);
        if (resolved.ok && resolved.instant) updated[field] = resolved.instant;
        else {
          const key = resolved.ok ? 'scheduleDateTimeRequired' : 'dateTime_' + resolved.reason;
          errors[offer.id] = { ...errors[offer.id], [field]: t(key) };
        }
      }
      const open = Date.parse(updated.saleStartAt);
      const close = Date.parse(updated.saleEndAt);
      const windowError = t('performances:offerWindowOutsidePerformance');
      if (!errors[offer.id]?.saleStartAt && !(open >= starts)) {
        errors[offer.id] = { ...errors[offer.id], saleStartAt: windowError };
      }
      if (!errors[offer.id]?.saleEndAt && !(close <= ends && open < close)) {
        errors[offer.id] = { ...errors[offer.id], saleEndAt: windowError };
      }
      return updated;
    });
    setDateErrors(errors);
    setMessage('');
    if (Object.keys(errors).length) {
      reportError(Object.values(errors).flatMap((fields) => fields ? Object.values(fields) : [])[0] ?? t('performances:saveFailed'));
      return;
    }

    const candidate = { ...sale, offers };
    const { saveIssue } = inspectSaleDraft(draft.layout, candidate, performance, Date.now());
    if (saveIssue) {
      reportError(t(saveIssue));
      return;
    }

    await run(async () => {
      const saved = await saveSaleDraft(id, candidate);
      setSale(saved);
      setSaleDirty(false);
      setEditedDates({});
      if (immutable) {
        // The server submits the revision as part of saving an already published show.
        setPublication({ status, saleVersion: saved.version, ticketingAcknowledged: false, checkinAcknowledged: false });
        onUpdate({ ...performance, status, saleVersion: saved.version });
        setMessage(t('performances:publicationSubmitted'));
      } else if (review) {
        onReview();
      } else {
        setMessage(t('performances:saved'));
      }
    });
  }

  function acceptLayout(next: LayoutDraft) {
    setDraft(next);
    if (immutable || !next.layout || !sale) return;
    const sections = new Map(next.layout.sections.map((section) => [section.id, section]));
    const groups = sale.groups.map((group) => {
      const section = group.sectionId ? sections.get(group.sectionId) : undefined;
      if (!section || section.kind !== group.kind) return group;
      if (group.kind === 'GA') return group.sectionLabel === section.label ? group : { ...group, sectionLabel: section.label };
      const previous = new Set(group.seats.map((seat) => seat.id));
      const seats = section.rows.flatMap((row) => row.seats.filter((seat) => previous.has(seat.id))
        .map((seat) => ({ id: seat.id, blocked: seat.blocked, rowLabel: row.label, seatLabel: seat.label })));
      const unchanged = group.sectionLabel === section.label && group.seats.length === seats.length
        && seats.every((seat, index) => {
          const current = group.seats[index];
          return current.id === seat.id && current.rowLabel === seat.rowLabel
            && current.seatLabel === seat.seatLabel && current.blocked === seat.blocked;
        });
      return unchanged ? group : { ...group, sectionLabel: section.label, seats, capacity: seats.filter((seat) => !seat.blocked).length };
    });
    if (groups.some((group, index) => group !== sale.groups[index])) replaceSale({ ...sale, groups });
  }

  const review = stage === 'review' && sale && draft
    ? inspectSaleDraft(draft.layout, sale, performance, Date.now())
    : null;
  const ready = Boolean(review && !review.saveIssue && !review.publishIssues.length && !dirty);

  async function publish() {
    if (!sale || !draft || !ready || immutable || stage !== 'review') return;
    await run(async () => {
      const published = await publishPerformance(id, sale.version, draft.version,
        { event: event.draftVersion, schedule: performance.draftVersion });
      setPublication(published);
      setSale({ ...sale, version: published.saleVersion });
      onUpdate({ ...performance, status: published.status, saleVersion: published.saleVersion, layoutVersion: draft.version || null });
      setMessage(t('performances:publicationSubmitted'));
    });
  }

  if (performance.legacyConcertId) {
    return <section className="performance-panel"><Link to={'/organizer/concerts/' + performance.legacyConcertId}>{t('performances:legacyWorkspace')}</Link></section>;
  }

  const showMap = mapOpen ?? Boolean(draft?.layout);
  return <div className="performance-admin">
    {error && <p className="performance-feedback" role="alert" tabIndex={-1} ref={errorNotice}>{error}</p>}
    {error && conflict && <div className="performance-options">
      <button type="button" className="button button-secondary" onClick={onReload}>{t('performances:reloadDraft')}</button>
    </div>}
    {message && <p role="status">{message}</p>}
    {(!draft || !sale) ? (error
      ? <button type="button" className="button button-secondary" onClick={() => {
        setError('');
        setReload((current) => current + 1);
      }}>{t('performances:refresh')}</button>
      : <p role="status">{t('performances:loading')}</p>) : <>
      <div hidden={stage !== 'tickets'}>
        <div className="performance-admin">
          {!immutable && <section className="performance-panel">
            <div className="performance-actions">
              <div>
                <h3>{t('performances:mapSetup')}</h3>
                {!draft.layout && <p>{t('performances:maplessAdmission')}</p>}
              </div>
              <button type="button" className="button button-secondary" aria-expanded={showMap}
                aria-controls="performance-map-editor" onClick={() => setMapOpen(!showMap)}>
                {t(showMap ? 'hideSeatingMap' : mapOpen === null ? 'addSeatingMap' : 'showSeatingMap')}
              </button>
            </div>
          </section>}
          <div id="performance-map-editor" hidden={!showMap}>
            {(mapOpen !== null || draft.layout) && <PerformanceLayoutEditor performance={performance} venue={venue} saved={draft} onSave={acceptLayout}
              onDirtyChange={setLayoutDirty} onBusyChange={setLayoutBusy} readOnly={immutable || busy} />}
          </div>
          <section className="performance-panel" aria-label={t('performances:saleConfig')}>
            <h3>{t('performances:saleConfig')}</h3>
            {!immutable && !sale.groups.length && <p>{t('performances:saleSetupHelp')}</p>}
            {immutable && <p>{t('performances:layoutLockedAfterPublication')}</p>}
            {layoutDirty && <p role="status">{t('performances:saveLayoutBeforeSale')}</p>}
            <PerformanceSeatAssignments sections={assignedSections} sale={sale} setSale={replaceSale} performance={performance}
              readOnly={immutable || saleDisabled} />
            <PerformanceSaleEditor sale={sale} setSale={replaceSale} layout={draft.layout} performance={performance}
              immutable={immutable} disabled={saleDisabled || (immutable && !canRevise)} editedDates={editedDates}
              dateErrors={dateErrors} onDateChange={editOfferDate} onResetDates={resetOfferDates} />
            <div className="performance-options">
              {!immutable ? <>
                <button type="button" className="button button-secondary" disabled={saleDisabled || !saleDirty}
                  onClick={() => void saveSale(false)}>{t('performances:saveSale')}</button>
                <button type="button" className="button button-primary" disabled={saleDisabled}
                  onClick={() => void saveSale(true)}>{t('performances:saveAndReview')}</button>
              </> : canRevise && <button type="button" className="button button-primary" disabled={saleDisabled || !saleDirty}
                onClick={() => void saveSale(false)}>{t('performances:publishRevision')}</button>}
            </div>
          </section>
        </div>
      </div>
      {stage === 'review' && review && <ReviewPerformance event={event} performance={performance} layout={draft.layout}
        sale={sale} issues={review.saveIssue ? [review.saveIssue, ...review.publishIssues] : review.publishIssues}
        immutable={immutable} disabled={saving} ready={ready} dirty={dirty} onEdit={onEdit}
        onEditSchedule={onEditSchedule} onPublish={() => void publish()} />}
      {publication?.checkinAcknowledged && <PerformanceStaffPanel id={id} />}
      {publication && immutable && <section className="performance-panel" aria-label={t('performances:publication')}>
        <h3>{t('performances:publication')}</h3>
        <dl className="publication-status">
          <div><dt>{t('performances:ticketing')}</dt><dd>{t(publication.ticketingAcknowledged ? 'synced' : 'notSynced')}</dd></div>
          <div><dt>{t('performances:checkin')}</dt><dd>{t(publication.checkinAcknowledged ? 'synced' : 'notSynced')}</dd></div>
        </dl>
        {pendingSync && <button type="button" className="button button-secondary" disabled={busy}
          onClick={() => void run(async () => setPublication(await getPublication(id)))}>{t('performances:refresh')}</button>}
        <p>{t('performances:disruptionSupport')} <span>{t('performances:performanceId')} {performance.id}</span></p>
        {publication.ticketingAcknowledged && performance.publicVisible && <Link to={eventPath(performance.eventId)}>{t('performances:publicView')}</Link>}
      </section>}
    </>}
  </div>;
}

function ReviewPerformance({
  event, performance, layout, sale, issues, immutable, disabled, ready, dirty, onEdit, onEditSchedule, onPublish,
}: {
  event: ManagedEvent;
  performance: ManagedPerformance;
  layout: LayoutDraft['layout'];
  sale: SaleDraft;
  issues: string[];
  immutable: boolean;
  disabled: boolean;
  ready: boolean;
  dirty: boolean;
  onEdit: () => void;
  onEditSchedule?: () => void;
  onPublish: () => void;
}) {
  const { t, i18n } = useTranslation('performances');
  const format = (time: string | null) => formatPerformanceDateTime(time, performance.timezone, i18n.resolvedLanguage);
  const activeOffers = sale.offers.filter((offer) => offer.active);
  const groups = new Map(sale.groups.map((group) => [group.id, group]));
  const activeGroupIds = new Set(activeOffers.map((offer) => offer.groupId));
  const capacity = sale.groups.reduce((total, group) => activeGroupIds.has(group.id) ? total + group.capacity : total, 0);
  return <section className="performance-panel performance-review" aria-labelledby="performance-review-heading">
    <dl className="performance-review-summary">
      <div><dt>{t('performances:title')}</dt><dd>{event.title}</dd></div>
      <div><dt>{t('performances:venueSpace')}</dt><dd>{performance.venueName} · {performance.spaceName}<br />{performance.venueAddress}</dd></div>
      <div><dt>{t('performances:startsAt')}</dt><dd>{format(performance.startsAt)}</dd></div>
      <div><dt>{t('performances:endsAt')}</dt><dd>{format(performance.endsAt)}</dd></div>
      {performance.doorsOpenAt && <div><dt>{t('performances:doorsOpenAt')}</dt><dd>{format(performance.doorsOpenAt)}</dd></div>}
      <div><dt>{t('performances:timezone')}</dt><dd>{performance.timezone}</dd></div>
      <div><dt>{t('performances:saleStartAt')}</dt><dd>{format(performance.saleStartAt)}</dd></div>
      <div><dt>{t('performances:saleEndAt')}</dt><dd>{format(performance.saleEndAt)}</dd></div>
      <div><dt>{t('performances:maxPerAccount')}</dt><dd>{number.format(performance.maxPerAccount)}</dd></div>
      <div><dt>{t('performances:publicListing')}</dt><dd>{t(performance.publicVisible ? 'reviewPublic' : 'reviewPrivate')}</dd></div>
      {layout && <div><dt>{t('performances:reviewMapSections')}</dt><dd>{number.format(layout.sections.length)}</dd></div>}
      <div><dt>{t('performances:reviewTotalCapacity')}</dt><dd>{number.format(capacity)}</dd></div>
    </dl>
    {!layout && <p>{t('performances:reviewMapless')}</p>}
    <h3>{t('performances:reviewTicketTypes')}</h3>
    {activeOffers.length > 0 ? <ul className="performance-review-offers">
      {activeOffers.map((offer) => {
        const sectionLabel = groups.get(offer.groupId)?.sectionLabel;
        return <li key={offer.id}>
          <div className="performance-actions">
            <strong>{offer.name}</strong>
            <span>{currency.format(offer.price)}</span>
          </div>
          {sectionLabel && sectionLabel !== offer.name && <div>{sectionLabel}</div>}
          <div>{format(offer.saleStartAt)} – {format(offer.saleEndAt)}</div>
        </li>;
      })}
    </ul> : <p>{t('performances:reviewNoActiveOffer')}</p>}
    {!immutable && (ready ? <>
      <p>{t('performances:reviewReady')}</p>
      <p>{t('performances:reviewPublicationHint')}</p>
    </> : <div className="performance-feedback">
      <p>{t('performances:reviewFixBeforePublishing')}</p>
      <ul>
        {dirty && <li>{t('performances:reviewUnsavedTickets')}</li>}
        {issues.map((issue) => <li key={issue}>{t(issue)}</li>)}
      </ul>
    </div>)}
    <div className="performance-options">
      {!immutable && onEditSchedule && <button type="button" className="button button-secondary" onClick={onEditSchedule}
        disabled={disabled}>{t('performances:editPerformanceSchedule')}</button>}
      <button type="button" className="button button-secondary" disabled={disabled} onClick={onEdit}>
        {t('performances:editTicketsAndMap')}
      </button>
      {!immutable && <button type="button" className="button button-primary" disabled={disabled || !ready} onClick={onPublish}>
        {t('performances:publish')}
      </button>}
    </div>
  </section>;
}
