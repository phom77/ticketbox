import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, Navigate, useLocation, useNavigate } from 'react-router-dom';
import { ApiClientError, isRequestCanceled } from '../../api/client';
import { getOrderByIdempotencyKey } from '../../api/orders';
import {
  checkoutPerformance,
  eventPath,
  getAvailability,
  getEventPerformance,
  getHold,
  getLayout,
  getMapSection,
  getSectionAvailability,
  releaseHold,
  replaceHold,
  type Availability,
  type Layout,
  type MapSection,
  type Offer,
  type PerformanceHold,
  type SectionAvailability,
  type Selection,
} from '../../api/performances';
import { clearStoredQueueAdmission, getStoredQueueAdmission, leaveQueue } from '../../api/queue';
import { BuyerState } from '../../components/feedback/BuyerState';
import { PanelSkeleton } from '../../components/feedback/Skeleton';
import { useToast } from '../../components/feedback/toast-context';
import { HoldTimer } from '../../components/purchase/HoldTimer';
import { formatLanguage } from '../../i18n';
import { purchasePaths } from '../event/eventView';
import { performanceTime } from '../performance/format';
import { formatPrice } from '../price/price';
import { SeatMap, VenueMap, type SectionStats } from './PerformanceMaps';
import { MapViewport } from './MapViewport';
import {
  FilterBar,
  Legend,
  OfferRowView,
  SelectionSummary,
  Stepper,
  type SummaryItem,
} from './SelectionParts';
import { TicketSelectionShell } from './TicketSelectionShell';
import {
  defaultFilters,
  heldUntil,
  holdProblem,
  parseQuantity,
  visibleRows,
  type OfferRow,
  type SelectionFilters,
} from './selection';
import { useDeadline } from './useDeadline';

const emptyHold: PerformanceHold = { version: 0, items: [], totalAmount: 0, expiresAt: null };
const problemKeys = {
  quota: 'customer:ticketSelection_problem_quota',
  soldOut: 'customer:ticketSelection_problem_soldOut',
  conflict: 'customer:ticketSelection_problem_conflict',
  rateLimit: 'customer:ticketSelection_problem_rateLimit',
  generic: 'customer:ticketSelection_problem_generic',
} as const;
type Detail = Awaited<ReturnType<typeof getEventPerformance>>;

export function PerformanceTickets({ id, eventId }: { id: string; eventId: string }) {
  const { t } = useTranslation('customer');
  const navigate = useNavigate();
  const toast = useToast();
  const { search } = useLocation();
  const [admission] = useState(() => getStoredQueueAdmission(id));
  const checkoutKey = 'ticketbox.performance-checkout.' + id;
  const [pendingOrderKey, setPendingOrderKey] = useState(() => sessionStorage.getItem(checkoutKey));
  const [context, setContext] = useState<Detail | null>(null);
  const [layout, setLayout] = useState<Layout | null>(null);
  const [availability, setAvailability] = useState<Availability | null>(null);
  const [selectedSection, setSelectedSection] = useState<string | null>(null);
  const [sectionLayout, setSectionLayout] = useState<{
    version: number;
    section: MapSection;
  } | null>(null);
  const [sectionAvailability, setSectionAvailability] = useState<SectionAvailability | null>(null);
  const [chosenOffers, setChosenOffers] = useState<Record<string, string>>({});
  const [hold, setHold] = useState<PerformanceHold>(emptyHold);
  const [busy, setBusy] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [refresh, setRefresh] = useState(0);
  const [accessibleOnly, setAccessibleOnly] = useState(false);
  const [visibleSeatRows, setVisibleSeatRows] = useState(20);
  const [filters, setFilters] = useState<SelectionFilters>(() => ({
    ...defaultFilters,
    quantity: parseQuantity(search),
  }));
  const [tip, setTip] = useState<string | null>(null);
  const [leaving, setLeaving] = useState(false);
  const transaction = useRef<string | null>(null);
  const recovery = useRef<{ payload: string; key: string } | null>(null);
  const mounted = useRef(false);
  const waitingRoom = purchasePaths({ id, eventId }).waitingRoom;

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  function backToWaitingRoom(message: string) {
    clearStoredQueueAdmission();
    toast.error(message);
    navigate(waitingRoom, { replace: true });
  }
  useDeadline(admission?.sessionExpiresAt, () => {
    if (!leaving) backToWaitingRoom(t('customer:ticketSelection_sessionExpired'));
  });
  useDeadline(hold.expiresAt, () => {
    if (!leaving && hold.items.length) backToWaitingRoom(t('customer:ticketSelection_holdExpired'));
  });

  useEffect(() => {
    if (!pendingOrderKey) return;
    let canceled = false;
    getOrderByIdempotencyKey(pendingOrderKey)
      .then((order) => {
        if (canceled) return;
        sessionStorage.removeItem(checkoutKey);
        clearStoredQueueAdmission();
        navigate('/checkout?orderId=' + encodeURIComponent(order.id), { replace: true });
      })
      .catch((requestError) => {
        if (canceled) return;
        if (requestError instanceof ApiClientError && requestError.status === 404) {
          setBusy(false);
          if (!admission) {
            sessionStorage.removeItem(checkoutKey);
            setPendingOrderKey(null);
          }
        } else setLoadError(t('performances:verifyOrderFailed'));
      });
    return () => {
      canceled = true;
    };
    // The checkout action handles immediate recovery and saves its key for a subsequent mount.
  }, [admission, checkoutKey, navigate, pendingOrderKey, t]);

  useEffect(() => {
    if (!admission) return;
    const controller = new AbortController();
    const { signal } = controller;
    let timer: number | undefined;
    let first = true;
    setLoadError(null);

    getEventPerformance(eventId, id, signal)
      .then((detail) => {
        if (signal.aborted) return;
        setContext(detail);
        if (detail.performance.layoutVersion != null) {
          void getLayout(id, signal)
            .then((map) => {
              if (!signal.aborted) setLayout(map);
            })
            .catch(() => {
              if (!signal.aborted) setLayout(null);
            });
        }
      })
      .catch(() => {
        if (!signal.aborted) setLoadError(t('performances:loadFailed'));
      });

    getHold(id, admission.queueAccessToken, signal)
      .then((current) => {
        if (!signal.aborted) setHold(current);
      })
      .catch((requestError) => {
        if (!signal.aborted && !isRequestCanceled(requestError)) {
          if (requestError instanceof ApiClientError && [401, 403].includes(requestError.status)) {
            clearStoredQueueAdmission();
            navigate(waitingRoom, { replace: true });
          } else setLoadError(t('performances:loadFailed'));
        }
      })
      .finally(() => {
        if (!signal.aborted) setBusy(false);
      });

    async function loadAvailability() {
      try {
        if (first || !document.hidden) {
          const next = await getAvailability(id, signal);
          if (!signal.aborted) setAvailability(next);
        }
      } catch {
        if (!signal.aborted && first) setLoadError(t('performances:loadFailed'));
      } finally {
        first = false;
        if (!signal.aborted)
          timer = window.setTimeout(loadAvailability, 8000 + Math.random() * 2000);
      }
    }
    void loadAvailability();
    return () => {
      controller.abort();
      window.clearTimeout(timer);
    };
  }, [admission, eventId, id, navigate, refresh, t, waitingRoom]);

  const activeSection = availability?.groups.find((group) => group.sectionId === selectedSection);
  const assigned = activeSection?.kind === 'ASSIGNED';
  useEffect(() => {
    if (!selectedSection || !assigned) return;
    const controller = new AbortController();
    const { signal } = controller;
    let timer: number | undefined;

    getMapSection(id, selectedSection, signal)
      .then((detail) => {
        if (!signal.aborted) setSectionLayout(detail);
      })
      .catch(() => {
        if (!signal.aborted) setNotice(t('performances:sectionFailed'));
      });

    async function refreshSection(sectionId: string, first: boolean) {
      try {
        if (first || !document.hidden) {
          const current = await getSectionAvailability(id, sectionId, signal);
          if (!signal.aborted) setSectionAvailability(current);
        }
      } catch {
        if (!signal.aborted && first) setNotice(t('performances:sectionFailed'));
      } finally {
        if (!signal.aborted)
          timer = window.setTimeout(
            () => void refreshSection(sectionId, false),
            8000 + Math.random() * 2000,
          );
      }
    }
    void refreshSection(selectedSection, true);
    return () => {
      controller.abort();
      window.clearTimeout(timer);
    };
  }, [id, selectedSection, assigned, refresh, t]);

  if (!admission && !pendingOrderKey) return <Navigate to={waitingRoom} replace />;

  const performance = context?.performance;
  const shownLayout = availability?.layoutVersion === layout?.version ? layout : null;
  const selectedMapSection =
    sectionLayout?.section.id === selectedSection &&
    sectionLayout?.version === availability?.layoutVersion
      ? sectionLayout.section
      : null;
  const sectionStock =
    sectionAvailability?.sectionId === selectedSection &&
    sectionAvailability?.layoutVersion === availability?.layoutVersion
      ? sectionAvailability
      : null;
  const stock = new Map(sectionStock?.seats.map((seat) => [seat.id, seat]));
  const heldSeats = new Set(hold.items.flatMap((item) => (item.seatId ? [item.seatId] : [])));
  const cannotChange = busy || !availability || !admission || leaving;
  const sectionOrder = new Map(shownLayout?.sections.map((section, index) => [section.id, index]));

  const sectionGroups =
    availability?.groups.filter((group) => group.sectionId === selectedSection) ?? [];
  const offerByGroup = new Map<string, Offer>();
  const rows: OfferRow[] = [];
  for (const group of availability?.groups ?? []) {
    const offers = group.offers.filter((offer) => offer.active);
    const chosen = offers.find((offer) => offer.id === chosenOffers[group.id]) ?? offers[0];
    if (chosen && group.sectionId === selectedSection) offerByGroup.set(group.id, chosen);
    for (const offer of offers)
      rows.push({
        key: group.id + ':' + offer.id,
        sectionId: group.sectionId,
        sectionLabel: group.sectionLabel,
        sectionOrder: group.sectionId ? (sectionOrder.get(group.sectionId) ?? null) : null,
        offerId: offer.id,
        offerName: offer.name,
        price: offer.price,
        available: group.available,
        kind: group.kind,
        maxPerAccount: performance?.maxPerAccount ?? null,
      });
  }
  const listed = visibleRows(rows, filters, (row) =>
    hold.items.some((item) => !item.seatId && item.offerId === row.offerId),
  );
  const matching = new Set(listed.map((row) => row.sectionId));
  const stats = new Map<string, SectionStats>();
  for (const row of rows) {
    if (!row.sectionId) continue;
    const current = stats.get(row.sectionId) ?? {
      available: 0,
      fromPrice: null,
      held: 0,
      match: false,
    };
    stats.set(row.sectionId, {
      ...current,
      fromPrice: current.fromPrice == null ? row.price : Math.min(current.fromPrice, row.price),
    });
  }
  for (const group of availability?.groups ?? []) {
    if (!group.sectionId) continue;
    const current = stats.get(group.sectionId);
    if (current)
      stats.set(group.sectionId, {
        ...current,
        available: current.available + group.available,
        match: matching.has(group.sectionId),
      });
  }
  for (const item of hold.items) {
    const group = availability?.groups.find(
      (entry) =>
        entry.offers.some((offer) => offer.id === item.offerId) &&
        entry.sectionLabel === item.sectionLabel,
    );
    const current = group?.sectionId ? stats.get(group.sectionId) : null;
    if (group?.sectionId && current)
      stats.set(group.sectionId, { ...current, held: current.held + item.quantity });
  }
  const maxQuantity = Math.max(
    10,
    ...rows.map((row) => row.maxPerAccount ?? 0),
    parseQuantity(search, 20),
  );

  function canSelectSeat(seatId: string) {
    if (cannotChange) return false;
    if (heldSeats.has(seatId)) return true;
    const current = stock.get(seatId);
    return Boolean(current?.available && offerByGroup.has(current.groupId));
  }

  function seatOfferDescription(seatId: string) {
    const held = hold.items.find((item) => item.seatId === seatId);
    if (held)
      return `${held.offerName} · ${formatPrice(held.unitPrice)} · ${t('customer:ticketSelection_selectedState')}`;
    const current = stock.get(seatId);
    const offer = current && offerByGroup.get(current.groupId);
    if (!offer) return t('performances:seatNotOnSale');
    if (!current.available) return t('performances:seatUnavailable');
    return `${offer.name} · ${formatPrice(offer.price)} · ${t('customer:ticketSelection_legendAvailable')}`;
  }

  function selectSection(sectionId: string | null) {
    setSelectedSection(sectionId);
    setVisibleSeatRows(20);
    setNotice(null);
    setTip(null);
  }

  function holdSelections(): Selection[] {
    return hold.items.map((item) =>
      item.seatId
        ? { offerId: item.offerId, seatId: item.seatId }
        : { offerId: item.offerId, quantity: item.quantity },
    );
  }

  async function changeHold(items: Selection[]) {
    if (!admission || !availability || transaction.current) return;
    const body = { layoutVersion: availability.layoutVersion, holdVersion: hold.version, items };
    const payload = JSON.stringify(body);
    const key =
      recovery.current?.payload === payload ? recovery.current.key : window.crypto.randomUUID();
    recovery.current = { payload, key };
    transaction.current = key;
    setBusy(true);
    setNotice(null);
    try {
      const confirmed = await replaceHold(id, admission.queueAccessToken, key, body);
      if (!mounted.current) return;
      setHold(confirmed);
      recovery.current = null;
    } catch (requestError) {
      if (!mounted.current) return;
      if (requestError instanceof ApiClientError && [401, 403].includes(requestError.status)) {
        backToWaitingRoom(t('customer:ticketSelection_sessionExpired'));
        return;
      }
      if (requestError instanceof ApiClientError && requestError.status === 409) {
        recovery.current = null;
        setRefresh((value) => value + 1);
      }
      setNotice(
        requestError instanceof ApiClientError
          ? t(problemKeys[holdProblem(requestError)])
          : t('performances:holdFailed'),
      );
    } finally {
      if (mounted.current) setBusy(false);
      transaction.current = null;
    }
  }

  function changeQuantity(offerId: string, quantity: number) {
    const items = holdSelections().filter((item) => 'seatId' in item || item.offerId !== offerId);
    if (quantity > 0) items.push({ offerId, quantity });
    void changeHold(items);
  }

  function selectSeat(seatId: string) {
    if (!canSelectSeat(seatId)) return;
    const items = holdSelections();
    if (heldSeats.has(seatId)) {
      void changeHold(items.filter((item) => !('seatId' in item) || item.seatId !== seatId));
      return;
    }
    const available = stock.get(seatId);
    const offer = available && offerByGroup.get(available.groupId);
    if (offer) void changeHold([...items, { offerId: offer.id, seatId }]);
  }

  async function checkout() {
    if (!admission || !hold.items.length || transaction.current) return;
    const key = sessionStorage.getItem(checkoutKey) ?? window.crypto.randomUUID();
    sessionStorage.setItem(checkoutKey, key);
    transaction.current = key;
    setBusy(true);
    setNotice(null);
    try {
      const existing = await getOrderByIdempotencyKey(key).catch((requestError) => {
        if (requestError instanceof ApiClientError && requestError.status === 404) return null;
        throw requestError;
      });
      const order =
        existing ?? (await checkoutPerformance(id, admission.queueAccessToken, key, hold.version));
      if (!mounted.current) return;
      sessionStorage.removeItem(checkoutKey);
      clearStoredQueueAdmission();
      navigate('/checkout?orderId=' + encodeURIComponent(order.id), { replace: true });
    } catch (requestError) {
      if (!mounted.current) return;
      if (requestError instanceof ApiClientError && [401, 403].includes(requestError.status)) {
        backToWaitingRoom(t('customer:ticketSelection_sessionExpired'));
        return;
      }
      setNotice(
        requestError instanceof ApiClientError && requestError.status < 500
          ? t(problemKeys[holdProblem(requestError)])
          : t('performances:verifyOrderFailed'),
      );
    } finally {
      if (mounted.current) setBusy(false);
      transaction.current = null;
    }
  }

  async function leave() {
    if (!admission || leaving || transaction.current) return;
    setLeaving(true);
    try {
      await releaseHold(id, admission.queueAccessToken);
    } catch {
      // The hold expires on its own if the explicit release fails.
    }
    try {
      await leaveQueue(id);
    } catch {
      // The backend session still expires by TTL.
    }
    if (!mounted.current) return;
    clearStoredQueueAdmission();
    navigate(eventPath(eventId), { replace: true });
  }

  if (loadError && !availability)
    return (
      <div className="buyer-page purchase-page page-width">
        <BuyerState
          tone="error"
          headingLevel={1}
          title={t('customer:ticketSelection_loadFailedTitle')}
          actions={
            <>
              <button
                className="button button-primary"
                type="button"
                onClick={() => setRefresh((v) => v + 1)}
              >
                {t('customer:ticketSelection_retry')}
              </button>
              <Link className="button button-secondary" to={eventPath(eventId)}>
                {t('customer:ticketSelection_backToEvent')}
              </Link>
            </>
          }
        >
          {loadError}
        </BuyerState>
      </div>
    );

  const items: SummaryItem[] = hold.items.map((item) => ({
    key: item.seatId ?? item.offerId,
    title: item.offerName,
    detail:
      item.sectionLabel +
      ' · ' +
      (item.seatId
        ? t('performances:seat', { row: item.rowLabel, seat: item.seatLabel })
        : '× ' + item.quantity),
    price: item.unitPrice * item.quantity,
    onRemove: () =>
      void changeHold(
        holdSelections().filter((entry) =>
          item.seatId
            ? !('seatId' in entry && entry.seatId === item.seatId)
            : 'seatId' in entry || entry.offerId !== item.offerId,
        ),
      ),
  }));
  const heldCount = hold.items.reduce((sum, item) => sum + item.quantity, 0);
  const seatRows = selectedMapSection?.rows.slice(0, visibleSeatRows) ?? [];

  const map = !availability ? (
    <PanelSkeleton label={t('performances:loading')} />
  ) : (
    <>
      <div className="ts-pane-head">
        <h2>
          {selectedMapSection && assigned
            ? selectedMapSection.label
            : t('customer:ticketSelection_venueMap')}
        </h2>
        {assigned && selectedSection ? (
          <button
            className="button button-secondary"
            type="button"
            onClick={() => selectSection(null)}
          >
            {t('customer:ticketSelection_backToVenue')}
          </button>
        ) : null}
      </div>
      {assigned && selectedMapSection && sectionStock ? (
        <MapViewport tip={tip} resetKey={selectedSection}>
          <SeatMap
            section={selectedMapSection}
            accessibleOnly={accessibleOnly}
            heldSeats={heldSeats}
            isAvailable={(seatId) => Boolean(stock.get(seatId)?.available)}
            describe={(row, seat, seatId) =>
              selectedMapSection.label +
              ' · ' +
              t('performances:seat', { row, seat }) +
              ' · ' +
              seatOfferDescription(seatId)
            }
            onSelect={selectSeat}
            onTip={setTip}
          />
        </MapViewport>
      ) : assigned && selectedSection ? (
        <p role="status">{t('performances:loadingSeats')}</p>
      ) : shownLayout ? (
        <MapViewport tip={tip}>
          <VenueMap
            layout={shownLayout}
            stats={stats}
            selectedSection={selectedSection}
            onSelect={selectSection}
            onTip={setTip}
          />
        </MapViewport>
      ) : (
        <BuyerState tone="empty">{t('customer:ticketSelection_noMap')}</BuyerState>
      )}
      {shownLayout ? <Legend seats={Boolean(assigned && selectedMapSection)} /> : null}
      {shownLayout ? <p className="ts-hint">{t('customer:ticketSelection_mapHint')}</p> : null}
    </>
  );

  const list = !availability ? (
    <PanelSkeleton label={t('performances:loading')} />
  ) : (
    <>
      <div className="ts-pane-head">
        <h2>{t('customer:ticketSelection_tickets')}</h2>
        <span>{t('customer:ticketSelection_results', { count: listed.length })}</span>
      </div>
      {notice ? (
        <p className="ts-notice" role="alert">
          {notice}
          {notice === t('performances:sectionFailed') && selectedSection ? (
            <button
              className="button button-secondary"
              type="button"
              onClick={() => setRefresh((v) => v + 1)}
            >
              {t('performances:refresh')}
            </button>
          ) : null}
        </p>
      ) : null}
      {listed.length ? (
        <ul className="ts-rows">
          {listed.map((row) => {
            const quantity =
              hold.items.find((item) => !item.seatId && item.offerId === row.offerId)?.quantity ??
              0;
            return (
              <OfferRowView key={row.key} row={row} selected={row.sectionId === selectedSection}>
                {row.kind === 'GA' ? (
                  <Stepper
                    row={row}
                    quantity={quantity}
                    busy={cannotChange}
                    onAdd={() => changeQuantity(row.offerId, quantity + 1)}
                    onRemove={() => changeQuantity(row.offerId, quantity - 1)}
                  />
                ) : (
                  <button
                    type="button"
                    className="button button-secondary"
                    aria-pressed={row.sectionId === selectedSection}
                    disabled={row.available <= 0}
                    onClick={() => selectSection(row.sectionId)}
                  >
                    {t('customer:ticketSelection_viewSeats')}
                  </button>
                )}
              </OfferRowView>
            );
          })}
        </ul>
      ) : (
        <BuyerState tone="empty" title={t('customer:ticketSelection_noMatchTitle')}>
          {rows.length
            ? t('customer:ticketSelection_noMatch')
            : t('customer:ticketSelection_noTickets')}
        </BuyerState>
      )}
      {assigned && selectedSection ? (
        <div className="ts-seats">
          {sectionGroups.map((group) => {
            const offers = group.offers.filter((offer) => offer.active);
            if (offers.length < 2) return null;
            return (
              <label key={group.id}>
                {t('customer:ticketSelection_ticketType')}
                <select
                  value={offerByGroup.get(group.id)?.id ?? ''}
                  onChange={(event) =>
                    setChosenOffers({ ...chosenOffers, [group.id]: event.target.value })
                  }
                >
                  {offers.map((offer) => (
                    <option key={offer.id} value={offer.id}>
                      {offer.name} · {formatPrice(offer.price)}
                    </option>
                  ))}
                </select>
              </label>
            );
          })}
          <h3>
            {t('customer:ticketSelection_seatsIn', { section: activeSection?.sectionLabel ?? '' })}
          </h3>
          {!sectionStock || !selectedMapSection ? (
            <p role="status">{t('performances:loadingSeats')}</p>
          ) : (
            <>
              <div className="ts-seat-rows">
                {seatRows.map((row) => (
                  <div
                    className="ts-seat-row"
                    key={row.id}
                    role="group"
                    aria-label={t('performances:row', { row: row.label })}
                  >
                    <strong>{row.label}</strong>
                    {row.seats
                      .filter((seat) => !accessibleOnly || seat.accessible)
                      .map((seat) => (
                        <button
                          key={seat.id}
                          type="button"
                          className="ts-seat-button"
                          aria-pressed={heldSeats.has(seat.id)}
                          aria-label={
                            t('performances:seat', { row: row.label, seat: seat.label }) +
                            (seat.accessible ? ' · ' + t('performances:accessible') : '') +
                            (seat.restrictedView ? ' · ' + t('performances:restrictedView') : '')
                          }
                          aria-description={seatOfferDescription(seat.id)}
                          data-accessible={seat.accessible}
                          data-restricted={seat.restrictedView}
                          disabled={!canSelectSeat(seat.id)}
                          onClick={() => selectSeat(seat.id)}
                          onMouseEnter={() =>
                            setTip(
                              selectedMapSection.label +
                                ' · ' +
                                t('performances:seat', { row: row.label, seat: seat.label }) +
                                ' · ' +
                                seatOfferDescription(seat.id),
                            )
                          }
                          onMouseLeave={() => setTip(null)}
                        >
                          {seat.label}
                        </button>
                      ))}
                  </div>
                ))}
              </div>
              {selectedMapSection.rows.length > visibleSeatRows && (
                <button
                  type="button"
                  className="button button-secondary"
                  onClick={() => setVisibleSeatRows((value) => value + 20)}
                >
                  {t('performances:moreRows')}
                </button>
              )}
            </>
          )}
        </div>
      ) : null}
    </>
  );

  return (
    <TicketSelectionShell
      defaultTab={performance?.layoutVersion == null && performance ? 'list' : 'map'}
      eventTitle={context?.event.title ?? t('performances:schedule')}
      subtitle={
        performance ? (
          <>
            <time dateTime={performance.startsAt}>{performanceTime(performance)}</time> ·{' '}
            {performance.venueName}
          </>
        ) : null
      }
      backLabel={t('customer:ticketSelection_backToEvent')}
      backDisabled={leaving || busy}
      onBack={() => void leave()}
      filters={
        <FilterBar
          rows={rows}
          filters={filters}
          maxQuantity={maxQuantity}
          onChange={setFilters}
          accessibleOnly={accessibleOnly}
          onAccessibleChange={setAccessibleOnly}
        />
      }
      map={map}
      list={list}
      summary={
        <SelectionSummary
          items={items}
          total={hold.totalAmount}
          wanted={filters.quantity}
          held={heldCount}
          busy={busy}
          leaving={leaving}
          continueDisabled={busy || leaving || hold.items.length === 0}
          onContinue={() => void checkout()}
          onLeave={() => void leave()}
          heldUntil={heldUntil(hold.expiresAt, performance?.timezone, formatLanguage())}
          timer={
            <HoldTimer
              expiresAt={hold.expiresAt}
              label={t('performances:holdExpiresIn')}
              warningMessage={t('customer:ticketSelection_holdWarning')}
              expiredMessage={t('customer:ticketSelection_holdExpired')}
            />
          }
        />
      }
    />
  );
}
