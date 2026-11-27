import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useLocation, useNavigate } from 'react-router-dom';
import { ApiClientError, isRequestCanceled } from '../../api/client';
import { getConcert, type ConcertDetail, type TicketType } from '../../api/concerts';
import { clearStoredQueueAdmission, getStoredQueueAdmission, leaveQueue } from '../../api/queue';
import {
  getCurrentHolds,
  releaseAllHolds,
  releaseTicket,
  reserveTicket,
} from '../../api/reservations';
import { ConcertSeatMap } from '../../components/ConcertSeatMap';
import { BuyerState } from '../../components/feedback/BuyerState';
import { PanelSkeleton } from '../../components/feedback/Skeleton';
import { useToast } from '../../components/feedback/toast-context';
import { HoldTimer } from '../../components/purchase/HoldTimer';
import { dateFormatter } from '../../data/formatters';
import { formatPrice } from '../price/price';
import { concertTitle } from '../concert/concertText';
import { useTicketAvailability } from '../concert/useTicketAvailability';
import { translate } from '../../i18n';
import { purchasePaths } from '../event/eventView';
import { MapViewport } from './MapViewport';
import {
  Legend,
  OfferRowView,
  SelectionSummary,
  Stepper,
  type SummaryItem,
} from './SelectionParts';
import { TicketSelectionShell } from './TicketSelectionShell';
import {
  defaultFilters,
  holdProblem,
  parseQuantity,
  visibleRows,
  type OfferRow,
  type SelectionFilters,
} from './selection';

type HoldAction = 'reserve' | 'release' | 'verify';
type HoldFeedback = { kind: 'error' | 'confirmed' | 'unverified'; message: string };
const problemKeys = {
  quota: 'customer:ticketSelection_problem_quota',
  soldOut: 'customer:ticketSelection_problem_soldOut',
  conflict: 'customer:ticketSelection_problem_conflict',
  rateLimit: 'customer:ticketSelection_problem_rateLimit',
  minimum: 'customer:ticketSelection_problem_minimum',
  generic: 'customer:ticketSelection_problem_generic',
} as const;
const eventDateTime = dateFormatter({ dateStyle: 'medium', timeStyle: 'short' });

/** Legacy zone-only concerts, adapted to the unified Choose tickets page. Holds change per click. */
export function ConcertTickets({ id }: { id: string }) {
  useTranslation();
  const navigate = useNavigate();
  const toast = useToast();
  const [admission] = useState(() => getStoredQueueAdmission(id));
  const [concert, setConcert] = useState<ConcertDetail | null>(null);
  const [concertStatus, setConcertStatus] = useState<'loading' | 'ready' | 'failed'>('loading');
  const [holdsStatus, setHoldsStatus] = useState<'loading' | 'ready' | 'failed'>('loading');
  const [selectedZone, setSelectedZone] = useState<string | null>(null);
  const [heldQuantities, setHeldQuantities] = useState<Record<string, number>>({});
  const [zoneLoading, setZoneLoading] = useState<Record<string, HoldAction>>({});
  const [feedback, setFeedback] = useState<Record<string, HoldFeedback | null>>({});
  const [reloadKey, setReloadKey] = useState(0);
  const [leaving, setLeaving] = useState(false);
  const { search } = useLocation();
  const [filters] = useState<SelectionFilters>(() => ({
    ...defaultFilters,
    quantity: parseQuantity(search),
  }));
  const [tip, setTip] = useState<string | null>(null);
  const inFlight = useRef(new Set<string>());
  // Clicks not yet confirmed by the server, per ticket type (+1 per add, -1 per remove).
  const queued = useRef(new Map<string, number>());
  const [pendingDelta, setPendingDelta] = useState<Record<string, number>>({});
  const active = useRef(false);
  const token = admission?.queueAccessToken;
  const {
    ticketTypes,
    loading: availabilityLoading,
    updatesDelayed,
    initialLoadFailed,
    refresh,
  } = useTicketAvailability(admission ? id : undefined, reloadKey);

  const returnToWaitingRoom = useCallback(
    (message: string) => {
      if (token && getStoredQueueAdmission(id)?.queueAccessToken === token)
        clearStoredQueueAdmission();
      toast.error(message);
      navigate(purchasePaths({ id }).waitingRoom, { replace: true });
    },
    [id, navigate, toast, token],
  );

  useEffect(() => {
    active.current = true;
    if (!admission) {
      returnToWaitingRoom(translate('customer:seatSelectionPage_missingAdmission'));
      return () => {
        active.current = false;
      };
    }

    const timer = window.setTimeout(
      () => returnToWaitingRoom(translate('customer:seatSelectionPage_phienMuaVeDaHetHanVui')),
      Math.max(0, Date.parse(admission.sessionExpiresAt) - Date.now()),
    );

    return () => {
      active.current = false;
      window.clearTimeout(timer);
    };
  }, [admission, returnToWaitingRoom]);

  useEffect(() => {
    if (!token) return;
    const controller = new AbortController();
    const { signal } = controller;
    setConcertStatus('loading');
    setHoldsStatus('loading');

    void getConcert(id, signal)
      .then((detail) => {
        if (signal.aborted) return;
        setConcert(detail);
        setConcertStatus('ready');
      })
      .catch((error: unknown) => {
        if (!signal.aborted && !isRequestCanceled(error)) setConcertStatus('failed');
      });

    void getCurrentHolds(id, token, signal)
      .then((holds) => {
        if (signal.aborted) return;
        setHeldQuantities(
          Object.fromEntries(holds.map(({ ticketTypeId, quantity }) => [ticketTypeId, quantity])),
        );
        setHoldsStatus('ready');
      })
      .catch((error: unknown) => {
        if (signal.aborted || isRequestCanceled(error)) return;
        if (error instanceof ApiClientError && error.status === 403) {
          returnToWaitingRoom(translate('customer:seatSelectionPage_phienMuaVeDaHetHanVui'));
          return;
        }
        setHoldsStatus('failed');
      });

    return () => controller.abort();
  }, [id, reloadKey, returnToWaitingRoom, token]);

  const pickerTypes = useMemo(() => {
    const availableIds = new Set(ticketTypes.map((type) => type.id));
    const previousTypes =
      concert?.ticketTypes.filter(
        (type) =>
          !availableIds.has(type.id) &&
          ((heldQuantities[type.id] ?? 0) > 0 ||
            zoneLoading[type.id] ||
            feedback[type.id]?.kind === 'unverified'),
      ) ?? [];
    return [...ticketTypes, ...previousTypes.map((type) => ({ ...type, availableQty: 0 }))];
  }, [concert, feedback, heldQuantities, ticketTypes, zoneLoading]);

  const typeLabels = useMemo(
    () => new Map(pickerTypes.map(({ id: typeId, name }) => [typeId, name])),
    [pickerTypes],
  );
  const disabledZoneIds = useMemo(
    () =>
      new Set(
        pickerTypes
          .filter((type) => type.availableQty <= 0 && !(heldQuantities[type.id] > 0))
          .map((type) => type.id),
      ),
    [heldQuantities, pickerTypes],
  );
  const currentType =
    pickerTypes.find((type) => type.id === selectedZone && !disabledZoneIds.has(type.id)) ??
    pickerTypes.find((type) => !disabledZoneIds.has(type.id));
  const selection = pickerTypes
    .filter((type) => heldQuantities[type.id] > 0)
    .map(({ id: typeId, name, price }) => ({
      id: typeId,
      name,
      price,
      quantity: heldQuantities[typeId],
    }));
  const ticketCount = Object.values(heldQuantities).reduce(
    (total, quantity) => total + quantity,
    0,
  );
  const subtotal = selection.reduce((total, item) => total + item.price * item.quantity, 0);
  const hasUnknownHold = Object.entries(heldQuantities).some(
    ([typeId, qty]) => qty > 0 && !typeLabels.has(typeId),
  );
  const verificationNeeded = Object.values(feedback).some((item) => item?.kind === 'unverified');
  const checkoutDisabled =
    !ticketCount ||
    leaving ||
    hasUnknownHold ||
    verificationNeeded ||
    Object.keys(zoneLoading).length > 0;

  function isCurrentSession() {
    return active.current && getStoredQueueAdmission(id)?.queueAccessToken === token;
  }

  function setZoneFeedback(typeId: string, notice: HoldFeedback | null) {
    setFeedback((current) => ({ ...current, [typeId]: notice }));
  }

  function setConfirmedQuantity(typeId: string, quantity: number) {
    setHeldQuantities((current) => ({ ...current, [typeId]: quantity }));
  }

  async function verifyQuantity(typeId: string, queueToken: string) {
    setZoneLoading((current) => ({ ...current, [typeId]: 'verify' }));
    try {
      const holds = await getCurrentHolds(id, queueToken);
      if (!isCurrentSession()) return;
      const quantity = holds.find((hold) => hold.ticketTypeId === typeId)?.quantity ?? 0;
      setConfirmedQuantity(typeId, quantity);
      setZoneFeedback(typeId, {
        kind: 'confirmed',
        message: translate('customer:seatSelectionPage_holdVerified'),
      });
    } catch (error) {
      if (!isCurrentSession()) return;
      if (error instanceof ApiClientError && error.status === 403) {
        returnToWaitingRoom(translate('customer:seatSelectionPage_phienMuaVeDaHetHanVui'));
        return;
      }
      setZoneFeedback(typeId, {
        kind: 'unverified',
        message: translate('customer:seatSelectionPage_holdVerifyFailed'),
      });
    }
  }

  function syncPending(typeId: string) {
    setPendingDelta((current) => ({ ...current, [typeId]: queued.current.get(typeId) ?? 0 }));
  }

  /** One reserve or release call. Returns false when the queue for this type should stop. */
  async function runHold(type: TicketType, action: 'reserve' | 'release', queueToken: string) {
    try {
      const mutate = action === 'reserve' ? reserveTicket : releaseTicket;
      const hold = await mutate(id, type.id, 1, queueToken);
      if (!isCurrentSession()) return false;
      if (
        hold?.ticketTypeId === type.id &&
        typeof hold.quantity === 'number' &&
        Number.isInteger(hold.quantity) &&
        hold.quantity >= 0
      ) {
        setConfirmedQuantity(type.id, hold.quantity);
        return true;
      }
      await verifyQuantity(type.id, queueToken);
      return false;
    } catch (error) {
      if (!isCurrentSession()) return false;
      if (error instanceof ApiClientError && error.status === 403) {
        returnToWaitingRoom(translate('customer:seatSelectionPage_phienMuaVeDaHetHanVui'));
      } else if (error instanceof ApiClientError && error.status === 429) {
        setZoneFeedback(type.id, {
          kind: 'error',
          message: translate('customer:seatSelectionPage_coQuaNhieuYeuCauVuiLong'),
        });
      } else if (
        error instanceof ApiClientError &&
        error.status < 500 &&
        error.status !== 408 &&
        !(action === 'release' && error.status === 400)
      ) {
        setZoneFeedback(type.id, {
          kind: 'error',
          message: translate(problemKeys[holdProblem(error)]),
        });
      } else {
        // A lost response may follow a committed write. Re-read the hold before allowing a new write.
        await verifyQuantity(type.id, queueToken);
      }
      return false;
    }
  }

  /** Sends queued clicks for one ticket type one at a time, so the count updates without waiting. */
  async function drain(type: TicketType, queueToken: string) {
    inFlight.current.add(type.id);
    try {
      for (;;) {
        const net = queued.current.get(type.id) ?? 0;
        if (net === 0) break;
        const step = net > 0 ? 1 : -1;
        setZoneLoading((current) => ({ ...current, [type.id]: step > 0 ? 'reserve' : 'release' }));
        const ok = await runHold(type, step > 0 ? 'reserve' : 'release', queueToken);
        if (!isCurrentSession()) return;
        queued.current.set(type.id, ok ? (queued.current.get(type.id) ?? 0) - step : 0);
        syncPending(type.id);
      }
    } finally {
      inFlight.current.delete(type.id);
      if (isCurrentSession()) {
        setZoneLoading((current) => {
          const next = { ...current };
          delete next[type.id];
          return next;
        });
        refresh();
      }
    }
  }

  function step(type: TicketType, direction: 1 | -1) {
    if (!token || leaving) return;
    if (!isCurrentSession()) {
      returnToWaitingRoom(translate('customer:seatSelectionPage_phienMuaVeDaHetHanVui'));
      return;
    }
    if (feedback[type.id]?.kind === 'unverified' || zoneLoading[type.id] === 'verify') return;

    const net = queued.current.get(type.id) ?? 0;
    const shown = (heldQuantities[type.id] ?? 0) + net;
    if (direction > 0 && (type.availableQty - Math.max(0, net) <= 0 || shown >= type.maxPerAccount))
      return;
    if (direction < 0 && shown <= 0) return;

    queued.current.set(type.id, net + direction);
    syncPending(type.id);
    setSelectedZone(type.id);
    setZoneFeedback(type.id, null);
    if (!inFlight.current.has(type.id)) void drain(type, token);
  }

  async function retryVerify(type: TicketType) {
    if (!token || leaving || inFlight.current.has(type.id)) return;
    inFlight.current.add(type.id);
    setZoneFeedback(type.id, null);
    try {
      await verifyQuantity(type.id, token);
    } finally {
      inFlight.current.delete(type.id);
      if (isCurrentSession()) {
        setZoneLoading((current) => {
          const next = { ...current };
          delete next[type.id];
          return next;
        });
        refresh();
      }
    }
  }

  function continueToCheckout() {
    if (!admission || !concert || checkoutDisabled || inFlight.current.size > 0) return;
    if (!isCurrentSession()) {
      returnToWaitingRoom(translate('customer:seatSelectionPage_phienMuaVeDaHetHanVui'));
      return;
    }

    navigate('/checkout', {
      state: {
        event: {
          id: concert.id,
          title: concert.title,
          translations: concert.translations,
          venue: concert.venueName,
          date: concert.eventDate,
          image: concert.posterUrl,
        },
        selection,
        queueAccessToken: admission.queueAccessToken,
        sessionExpiresAt: admission.sessionExpiresAt,
      },
    });
  }

  async function leaveSelection() {
    if (!token || leaving || inFlight.current.size > 0) return;
    setLeaving(true);
    try {
      await releaseAllHolds(id, token);
    } catch {
      // Session expiry releases holds if the explicit request fails.
    }
    if (!isCurrentSession()) return;
    try {
      await leaveQueue(id);
    } catch {
      // The backend session still expires by TTL.
    }
    if (!isCurrentSession()) return;
    clearStoredQueueAdmission();
    navigate(purchasePaths({ id }).details, { replace: true });
  }

  const rows: OfferRow[] = pickerTypes.map((type) => ({
    key: type.id,
    sectionId: null,
    sectionLabel: type.name,
    sectionOrder: null,
    offerId: type.id,
    offerName: type.name,
    price: type.price,
    available: type.availableQty,
    kind: 'ZONE',
    maxPerAccount: type.maxPerAccount,
  }));
  const listed = visibleRows(
    rows,
    filters,
    (row) => (heldQuantities[row.key] ?? 0) > 0 || Boolean(zoneLoading[row.key]),
  );

  if (
    !admission ||
    concertStatus === 'loading' ||
    availabilityLoading ||
    holdsStatus === 'loading'
  ) {
    return (
      <div className="buyer-page purchase-page page-width">
        <BuyerState
          tone="loading"
          headingLevel={1}
          title={translate('customer:seatSelectionPage_chonVe')}
        >
          <PanelSkeleton label={translate('customer:seatSelectionPage_loading')} />
        </BuyerState>
      </div>
    );
  }

  if (!concert || concertStatus === 'failed' || initialLoadFailed || holdsStatus === 'failed') {
    return (
      <div className="buyer-page purchase-page page-width">
        <BuyerState
          tone="error"
          headingLevel={1}
          title={translate('customer:seatSelectionPage_loadFailed')}
          actions={
            <>
              <button
                className="button button-primary"
                type="button"
                onClick={() => setReloadKey((value) => value + 1)}
              >
                {translate('customer:seatSelectionPage_thuLai')}
              </button>
              <button
                className="button button-secondary"
                type="button"
                disabled={leaving}
                onClick={() => void leaveSelection()}
              >
                {translate('customer:seatSelectionPage_chiTietSuKien')}
              </button>
            </>
          }
        >
          {translate('customer:seatSelectionPage_loadFailedHelp')}
        </BuyerState>
      </div>
    );
  }

  const summaryItems: SummaryItem[] = selection.map((item) => ({
    key: item.id,
    title: item.name,
    detail: '× ' + item.quantity,
    price: item.price * item.quantity,
  }));
  const updating = Object.keys(zoneLoading).length > 0;
  const zoneTip = (typeId: string | null) => {
    const type = typeId ? pickerTypes.find((entry) => entry.id === typeId) : null;
    setTip(
      type
        ? `${type.name} · ${formatPrice(type.price)} · ${
            type.availableQty > 0
              ? translate('customer:seatSelectionPage_conVe')
              : translate('customer:seatSelectionPage_hetVe')
          }`
        : null,
    );
  };

  return (
    <TicketSelectionShell
      defaultTab={concert.seatMapSvg ? 'map' : 'list'}
      eventTitle={concertTitle(concert)}
      subtitle={
        <>
          <time dateTime={concert.eventDate}>
            {eventDateTime.format(new Date(concert.eventDate))}
          </time>
          {concert.venueName ? <> · {concert.venueName}</> : null}
        </>
      }
      backLabel={translate('customer:seatSelectionPage_chiTietSuKien')}
      backDisabled={leaving || updating}
      onBack={() => void leaveSelection()}
      map={
        <>
          <div className="ts-pane-head">
            <h2>{translate('customer:seatSelectionPage_map')}</h2>
          </div>
          <MapViewport tip={tip}>
            <ConcertSeatMap
              svg={concert.seatMapSvg}
              selectedTicketTypeId={currentType?.id ?? null}
              disabledTicketTypeIds={disabledZoneIds}
              ticketTypeLabels={typeLabels}
              onZoneSelect={setSelectedZone}
              onZoneHover={zoneTip}
            />
          </MapViewport>
          <Legend />
          {concert.seatMapSvg ? (
            <p className="ts-hint">
              {translate('customer:seatSelectionPage_chonPhanKhuTrenSoDoHoac')}
            </p>
          ) : null}
        </>
      }
      list={
        <>
          <div className="ts-pane-head">
            <h2>{translate('customer:seatSelectionPage_chonHangVe')}</h2>
          </div>
          {updatesDelayed ? (
            <p className="ts-notice" role="status">
              {translate('customer:seatSelectionPage_availabilityDelayed')}
            </p>
          ) : null}
          {hasUnknownHold ? (
            <p role="alert" className="ts-notice">
              {translate('customer:seatSelectionPage_missingHeldType')}
            </p>
          ) : null}
          {listed.length ? (
            <ul className="ts-rows">
              {listed.map((row) => {
                const type = pickerTypes.find((entry) => entry.id === row.key)!;
                const note = feedback[row.key];
                const verifying = zoneLoading[row.key] === 'verify';
                const locked = verifying || note?.kind === 'unverified' || leaving;
                const shown = (heldQuantities[row.key] ?? 0) + (pendingDelta[row.key] ?? 0);
                return (
                  <OfferRowView
                    key={row.key}
                    row={row}
                    selected={currentType?.id === row.key}
                    note={
                      verifying ? (
                        <small role="status">
                          {translate('customer:seatSelectionPage_holdVerifying')}
                        </small>
                      ) : note ? (
                        <small
                          className="ts-reason"
                          role={note.kind === 'confirmed' ? 'status' : 'alert'}
                        >
                          {note.message}
                          {note.kind === 'unverified' ? (
                            <button
                              className="button button-secondary"
                              type="button"
                              disabled={leaving}
                              onClick={() => void retryVerify(type)}
                            >
                              {translate('customer:seatSelectionPage_holdRetry')}
                            </button>
                          ) : null}
                        </small>
                      ) : null
                    }
                  >
                    <Stepper
                      row={row}
                      quantity={shown}
                      busy={locked}
                      addLabel={translate('customer:seatSelectionPage_themMotVe', {
                        arg1: type.name,
                      })}
                      removeLabel={translate('customer:seatSelectionPage_boMotVe', {
                        arg1: type.name,
                      })}
                      onAdd={() => step(type, 1)}
                      onRemove={() => step(type, -1)}
                    />
                  </OfferRowView>
                );
              })}
            </ul>
          ) : (
            <BuyerState
              tone="empty"
              title={translate(
                rows.length
                  ? 'customer:ticketSelection_noMatchTitle'
                  : 'customer:seatSelectionPage_noTypes',
              )}
            >
              {rows.length ? translate('customer:ticketSelection_noMatch') : undefined}
            </BuyerState>
          )}
        </>
      }
      summary={
        <SelectionSummary
          items={summaryItems}
          total={hasUnknownHold ? null : subtotal}
          wanted={filters.quantity}
          held={ticketCount}
          busy={updating}
          leaving={leaving}
          continueDisabled={checkoutDisabled}
          onContinue={continueToCheckout}
          onLeave={() => void leaveSelection()}
          timer={
            <HoldTimer
              expiresAt={admission.sessionExpiresAt}
              label={translate('customer:seatSelectionPage_thoiGianChonVe')}
              warningMessage={translate('customer:seatSelectionPage_phienMuaVe10PhutCuaBan')}
            />
          }
        />
      }
    />
  );
}
