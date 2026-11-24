import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ArrowLeft, ArrowRight, CalendarDays, MapPin, Minus, Plus } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useNavigate, useParams } from 'react-router-dom';
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
import { useToast } from '../../components/feedback/toast-context';
import { dateFormatter } from '../../data/formatters';
import { HoldTimer } from '../../components/purchase/HoldTimer';
import { PurchaseProgress } from '../../components/purchase/PurchaseProgress';
import { purchasePaths } from '../../features/event/eventView';
import { AllInPriceNote } from '../../features/price/AllInPrice';
import { formatPrice } from '../../features/price/price';
import { useAuth } from '../../features/auth/AuthContext';
import { concertTitle } from '../../features/concert/concertText';
import { useTicketAvailability } from '../../features/concert/useTicketAvailability';
import { translate } from '../../i18n';
import './SeatSelectionPage.css';

export type CheckoutSelection = Pick<TicketType, 'id' | 'name' | 'price'> & {
  quantity: number;
  sectionLabel?: string | null;
  rowLabel?: string | null;
  seatLabel?: string | null;
};

type HoldAction = 'reserve' | 'release' | 'verify';
type HoldFeedback = { kind: 'error' | 'confirmed' | 'unverified'; message: string };
const eventDateTime = dateFormatter({ dateStyle: 'medium', timeStyle: 'short' });

export function SeatSelectionPage() {
  const { id } = useParams();
  const { user } = useAuth();
  return id ? <SeatSelection key={`${user?.id ?? ''}:${id}`} id={id} /> : null;
}

function SeatSelection({ id }: { id: string }) {
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
  const inFlight = useRef(new Set<string>());
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

  async function updateQuantity(type: TicketType, action: HoldAction) {
    if (!token || leaving || inFlight.current.has(type.id)) return;
    if (!isCurrentSession()) {
      returnToWaitingRoom(translate('customer:seatSelectionPage_phienMuaVeDaHetHanVui'));
      return;
    }

    const quantity = heldQuantities[type.id] ?? 0;
    if (action === 'reserve' && (type.availableQty <= 0 || quantity >= type.maxPerAccount)) return;
    if (action === 'release' && quantity === 0) return;
    if (action !== 'verify' && feedback[type.id]?.kind === 'unverified') return;

    inFlight.current.add(type.id);
    setSelectedZone(type.id);
    setZoneFeedback(type.id, null);
    setZoneLoading((current) => ({ ...current, [type.id]: action }));

    try {
      if (action === 'verify') {
        await verifyQuantity(type.id, token);
        return;
      }

      const mutate = action === 'reserve' ? reserveTicket : releaseTicket;
      const hold = await mutate(id, type.id, 1, token);
      if (!isCurrentSession()) return;
      if (
        hold?.ticketTypeId === type.id &&
        typeof hold.quantity === 'number' &&
        Number.isInteger(hold.quantity) &&
        hold.quantity >= 0
      ) {
        setConfirmedQuantity(type.id, hold.quantity);
      } else {
        await verifyQuantity(type.id, token);
      }
    } catch (error) {
      if (!isCurrentSession()) return;
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
        setZoneFeedback(type.id, { kind: 'error', message: error.message });
      } else {
        // A lost response may follow a committed write. Re-read the hold before allowing a new write.
        await verifyQuantity(type.id, token);
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

  if (
    !admission ||
    concertStatus === 'loading' ||
    availabilityLoading ||
    holdsStatus === 'loading'
  ) {
    return (
      <div className="buyer-page purchase-page page-width">
        <div className="buyer-state" role="status">
          <h1>{translate('customer:seatSelectionPage_chonVe')}</h1>
          <p>{translate('customer:seatSelectionPage_loading')}</p>
        </div>
      </div>
    );
  }

  if (!concert || concertStatus === 'failed' || initialLoadFailed || holdsStatus === 'failed') {
    return (
      <div className="buyer-page purchase-page page-width">
        <div className="buyer-state purchase-seat-error" role="alert">
          <h1>{translate('customer:seatSelectionPage_loadFailed')}</h1>
          <p>{translate('customer:seatSelectionPage_loadFailedHelp')}</p>
          <div>
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
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="buyer-page purchase-page page-width purchase-seat-page">
      <header className="purchase-header purchase-seat-header">
        <button
          className="back-link purchase-seat-back"
          type="button"
          disabled={leaving || Object.keys(zoneLoading).length > 0}
          onClick={() => void leaveSelection()}
        >
          <ArrowLeft size={16} aria-hidden="true" />
          {translate('customer:seatSelectionPage_chiTietSuKien')}
        </button>
        <div className="purchase-seat-context">
          <PurchaseProgress current="tickets" />
          <h1>{concertTitle(concert)}</h1>
          <p className="purchase-seat-event">
            <span>
              <CalendarDays size={16} aria-hidden="true" />
              {eventDateTime.format(new Date(concert.eventDate))}
            </span>
            {concert.venueName ? (
              <span>
                <MapPin size={16} aria-hidden="true" />
                {concert.venueName}
              </span>
            ) : null}
          </p>
        </div>
        <SelectionDeadline expiresAt={admission.sessionExpiresAt} />
      </header>

      <div className="purchase-columns">
        <section
          className="purchase-panel purchase-seat-map"
          aria-labelledby="purchase-seat-map-title"
        >
          <h2 id="purchase-seat-map-title">{translate('customer:seatSelectionPage_map')}</h2>
          <ConcertSeatMap
            svg={concert.seatMapSvg}
            selectedTicketTypeId={currentType?.id ?? null}
            disabledTicketTypeIds={disabledZoneIds}
            ticketTypeLabels={typeLabels}
            onZoneSelect={setSelectedZone}
          />
          {concert.seatMapSvg ? (
            <p>{translate('customer:seatSelectionPage_chonPhanKhuTrenSoDoHoac')}</p>
          ) : null}
        </section>

        <aside
          className="purchase-panel purchase-ticket-picker"
          aria-labelledby="purchase-ticket-picker-title"
        >
          <h2 id="purchase-ticket-picker-title">
            {translate('customer:seatSelectionPage_chonHangVe')}
          </h2>
          {updatesDelayed ? (
            <p className="purchase-seat-feedback" role="status">
              {translate('customer:seatSelectionPage_availabilityDelayed')}
            </p>
          ) : null}
          {pickerTypes.length ? (
            <div className="purchase-zone-list">
              {pickerTypes.map((type) => (
                <TicketTypeRow
                  key={type.id}
                  type={type}
                  selected={currentType?.id === type.id}
                  quantity={heldQuantities[type.id] ?? 0}
                  updating={zoneLoading[type.id]}
                  feedback={feedback[type.id]}
                  leaving={leaving}
                  onSelect={() => setSelectedZone(type.id)}
                  onUpdate={(action) => void updateQuantity(type, action)}
                />
              ))}
            </div>
          ) : (
            <p className="purchase-seat-feedback">
              {translate('customer:seatSelectionPage_noTypes')}
            </p>
          )}
          {hasUnknownHold ? (
            <p role="alert" className="purchase-seat-feedback">
              {translate('customer:seatSelectionPage_missingHeldType')}
            </p>
          ) : null}
          <div className="purchase-action-bar">
            <div className="purchase-seat-total">
              <span>
                {translate('customer:seatSelectionPage_veDangGiu', { count: ticketCount })}
              </span>
              <strong>
                {hasUnknownHold ? (
                  translate('customer:seatSelectionPage_subtotalUnavailable')
                ) : (
                  <>
                    {translate('customer:seatSelectionPage_subtotal')} {formatPrice(subtotal)}
                  </>
                )}
              </strong>
              <AllInPriceNote />
            </div>
            <button
              className="button button-primary"
              type="button"
              disabled={checkoutDisabled}
              onClick={continueToCheckout}
            >
              {translate('customer:seatSelectionPage_tiepTucThanhToan')}{' '}
              <ArrowRight size={17} aria-hidden="true" />
            </button>
          </div>
        </aside>
      </div>
    </div>
  );
}

function SelectionDeadline({ expiresAt }: { expiresAt: string }) {
  return (
    <div className="purchase-seat-time">
      <HoldTimer
        expiresAt={expiresAt}
        label={translate('customer:seatSelectionPage_thoiGianChonVe')}
        warningMessage={translate('customer:seatSelectionPage_phienMuaVe10PhutCuaBan')}
      />
    </div>
  );
}

function TicketTypeRow({
  type,
  selected,
  quantity,
  updating,
  feedback,
  leaving,
  onSelect,
  onUpdate,
}: {
  type: TicketType;
  selected: boolean;
  quantity: number;
  updating?: HoldAction;
  feedback: HoldFeedback | null;
  leaving: boolean;
  onSelect: () => void;
  onUpdate: (action: HoldAction) => void;
}) {
  const soldOut = type.availableQty <= 0;
  const locked = Boolean(updating) || feedback?.kind === 'unverified' || leaving;
  const canAdd = !locked && !soldOut && quantity < type.maxPerAccount;
  const canRemove = !locked && quantity > 0;
  const row = useRef<HTMLElement>(null);
  const headingId = `purchase-zone-${type.id}`;
  const pendingLabel = {
    reserve: 'customer:seatSelectionPage_dangGiu',
    release: 'customer:seatSelectionPage_dangGiaiPhong',
    verify: 'customer:seatSelectionPage_holdVerifying',
  } as const;

  return (
    <article
      className="purchase-zone"
      data-selected={selected}
      aria-labelledby={headingId}
      ref={row}
      tabIndex={-1}
    >
      <div className="purchase-zone-info">
        <h3 id={headingId}>
          <button
            type="button"
            aria-pressed={selected}
            disabled={soldOut && !quantity}
            onClick={onSelect}
          >
            {type.name}
          </button>
        </h3>
        <p className="purchase-zone-price">
          <strong>{formatPrice(type.price)}</strong>
        </p>
        <p>
          {translate('customer:seatSelectionPage_toiDaVeTaiKhoan', { arg1: type.maxPerAccount })}
        </p>
      </div>
      <div className="purchase-zone-actions">
        <p className="purchase-zone-availability" data-sold-out={soldOut}>
          {soldOut
            ? translate('customer:seatSelectionPage_hetVe')
            : translate('customer:seatSelectionPage_conVe')}
        </p>
        <div className="purchase-zone-quantity" aria-busy={Boolean(updating)}>
          <button
            type="button"
            aria-label={translate('customer:seatSelectionPage_boMotVe', { arg1: type.name })}
            aria-disabled={!canRemove}
            onClick={() => {
              if (canRemove) onUpdate('release');
            }}
          >
            <Minus size={16} aria-hidden="true" />
          </button>
          <span aria-live="polite">{quantity}</span>
          <button
            type="button"
            aria-label={translate('customer:seatSelectionPage_themMotVe', { arg1: type.name })}
            aria-disabled={!canAdd}
            onClick={() => {
              if (canAdd) onUpdate('reserve');
            }}
          >
            <Plus size={16} aria-hidden="true" />
          </button>
        </div>
      </div>
      {updating ? (
        <p className="purchase-zone-feedback" role="status">
          {translate(pendingLabel[updating])}
        </p>
      ) : feedback ? (
        <div className="purchase-zone-feedback" data-error={feedback.kind !== 'confirmed'}>
          <p role={feedback.kind === 'confirmed' ? 'status' : 'alert'}>{feedback.message}</p>
          {feedback.kind === 'unverified' ? (
            <button
              className="button button-secondary"
              type="button"
              disabled={leaving}
              onClick={() => {
                row.current?.focus();
                onUpdate('verify');
              }}
            >
              {translate('customer:seatSelectionPage_holdRetry')}
            </button>
          ) : null}
        </div>
      ) : null}
    </article>
  );
}
