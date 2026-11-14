import { translate, formatLanguage } from '../../i18n';
import { useTranslation } from 'react-i18next';
import { concertTitle } from '../../features/concert/concertText';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { ApiClientError, isRequestCanceled } from '../../api/client';
import { getConcert, type ConcertDetail, type TicketType } from '../../api/concerts';
import { clearStoredQueueAdmission, getStoredQueueAdmission, leaveQueue } from '../../api/queue';
import { releaseAllHolds, releaseTicket, reserveTicket } from '../../api/reservations';
import { ConcertSeatMap } from '../../components/ConcertSeatMap';
import { useToast } from '../../components/feedback/toast-context';
import { currency, eventDate } from '../../data/formatters';
import { useTicketAvailability } from '../../features/concert/useTicketAvailability';
import { useCountdown } from '../../hooks/useCountdown';

export type CheckoutSelection = Pick<TicketType, 'id' | 'name' | 'price'> & { quantity: number };

type ZoneLoadingAction = 'reserve' | 'release';

export function SeatSelectionPage() {
  useTranslation();
  const { id } = useParams();
  const navigate = useNavigate();
  const toast = useToast();
  const [concert, setConcert] = useState<ConcertDetail | null>(null);
  const [selectedZone, setSelectedZone] = useState<string | null>(null);
  const [heldQuantities, setHeldQuantities] = useState<Record<string, number>>({});
  const [zoneLoading, setZoneLoading] = useState<Record<string, ZoneLoadingAction>>({});
  const [concertLoading, setConcertLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [inventoryNotice, setInventoryNotice] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);
  const selectionWarningShown = useRef(false);
  const queueAdmission = id ? getStoredQueueAdmission(id) : null;
  const selectionCountdown = useCountdown(queueAdmission?.sessionExpiresAt, 120);
  const {
    ticketTypes,
    loading: availabilityLoading,
    updatesDelayed,
    initialLoadFailed,
    lastUpdatedAt,
    refresh,
  } = useTicketAvailability(id, reloadKey);

  useEffect(() => {
    if (
      !selectionCountdown.isWarning ||
      selectionCountdown.isExpired ||
      selectionWarningShown.current
    )
      return;
    selectionWarningShown.current = true;
    toast.error('Less than 2 minutes left to choose tickets.');
  }, [selectionCountdown.isExpired, selectionCountdown.isWarning, toast]);

  useEffect(() => {
    if (!id || !selectionCountdown.isExpired) return;
    returnToWaitingRoom('Your ticket selection time expired.');
  }, [id, selectionCountdown.isExpired]);

  useEffect(() => {
    if (!id) return;
    const admission = getStoredQueueAdmission(id);
    if (!admission) {
      navigate(`/concerts/${id}/waiting-room`, { replace: true });
      return;
    }

    const expiresInMs = new Date(admission.sessionExpiresAt).getTime() - Date.now();
    const timeoutId = window.setTimeout(
      () => {
        clearStoredQueueAdmission();
        setHeldQuantities({});
        navigate(`/concerts/${id}/waiting-room`, { replace: true });
      },
      Math.max(0, expiresInMs),
    );

    return () => window.clearTimeout(timeoutId);
  }, [id, navigate]);

  useEffect(() => {
    if (!id) return;
    const controller = new AbortController();
    let active = true;
    setConcertLoading(true);
    setError(null);
    getConcert(id, controller.signal)
      .then((detail) => {
        if (!active) return;
        setConcert(detail);
        setError(null);
      })
      .catch((requestError: unknown) => {
        if (active && !isRequestCanceled(requestError))
          setError(translate("customer:seatSelectionPage_khongTheTaiConcertVaSoDo"));
      })
      .finally(() => {
        if (active) setConcertLoading(false);
      });
    return () => {
      active = false;
      controller.abort();
    };
  }, [id, reloadKey]);

  useEffect(() => {
    if (ticketTypes.length === 0) {
      setSelectedZone(null);
      return;
    }

    setSelectedZone((current) => {
      const currentType = ticketTypes.find((item) => item.id === current);
      return currentType &&
        (currentType.availableQty > 0 || (heldQuantities[currentType.id] ?? 0) > 0)
        ? current
        : (ticketTypes.find((item) => item.availableQty > 0)?.id ?? null);
    });
  }, [heldQuantities, ticketTypes]);

  useEffect(() => {
    const adjustedTypes = ticketTypes.filter(
      (ticketType) => (heldQuantities[ticketType.id] ?? 0) > ticketType.maxPerAccount,
    );

    if (adjustedTypes.length === 0) return;

    setHeldQuantities((current) => {
      const next = { ...current };
      for (const ticketType of adjustedTypes) {
        next[ticketType.id] = ticketType.maxPerAccount;
      }
      return next;
    });
    setInventoryNotice(
      translate("customer:seatSelectionPage_gioiHanGiuVeCuaDaThay", { arg1: adjustedTypes.map((item) => item.name).join(', ') }),
    );
  }, [heldQuantities, ticketTypes]);

  const selection = useMemo<CheckoutSelection[]>(
    () =>
      ticketTypes
        .filter((item) => (heldQuantities[item.id] ?? 0) > 0)
        .map((item) => ({ ...item, quantity: heldQuantities[item.id] })),
    [heldQuantities, ticketTypes],
  );
  const soldOutTicketTypeIds = useMemo(
    () =>
      new Set(
        ticketTypes
          .filter((item) => item.availableQty === 0 && (heldQuantities[item.id] ?? 0) === 0)
          .map((item) => item.id),
      ),
    [heldQuantities, ticketTypes],
  );
  const ticketCount = selection.reduce((total, item) => total + item.quantity, 0);
  const subtotal = selection.reduce((total, item) => total + item.price * item.quantity, 0);

  function returnToWaitingRoom(message: string) {
    clearStoredQueueAdmission();
    setHeldQuantities({});
    toast.error(message);
    if (id) navigate(`/concerts/${id}/waiting-room`, { replace: true });
  }

  function showReserveFailure(requestError: unknown) {
    if (requestError instanceof ApiClientError) {
      if (requestError.status === 401 || requestError.status === 403) {
        returnToWaitingRoom(translate("customer:seatSelectionPage_phienMuaVeDaHetHanVui"));
        return;
      }

      if (requestError.status === 409) {
        if (requestError.message.toLowerCase().includes('limit')) {
          const message = translate("customer:seatSelectionPage_banDaDatGioiHanMuaCho");
          setInventoryNotice(message);
          toast.error(message);
          return;
        }
        setInventoryNotice(translate("customer:seatSelectionPage_hangVeNayVuaHetHoacKhong"));
        toast.error(translate("customer:seatSelectionPage_hangVeNayVuaHetHoacKhong"));
        refresh();
        return;
      }

      if (requestError.status === 429) {
        toast.error(translate("customer:seatSelectionPage_coQuaNhieuYeuCauVuiLong"));
        return;
      }
    }

    toast.error(
      requestError instanceof Error ? requestError.message : translate("customer:seatSelectionPage_khongTheCapNhatLuotGiuVe"),
    );
  }

  async function updateQuantity(ticketType: TicketType, delta: 1 | -1) {
    if (!id) return;
    const admission = getStoredQueueAdmission(id);
    if (!admission) {
      returnToWaitingRoom(translate("customer:seatSelectionPage_phienMuaVeDaHetHanVui"));
      return;
    }

    const currentQuantity = heldQuantities[ticketType.id] ?? 0;
    if (delta > 0 && currentQuantity >= ticketType.maxPerAccount) {
      const message = translate("customer:seatSelectionPage_toiDaVeChoMoiTaiKhoan", { arg1: ticketType.maxPerAccount, arg2: ticketType.name });
      setInventoryNotice(message);
      toast.error(message);
      return;
    }
    if (delta > 0 && ticketType.availableQty <= 0) {
      setInventoryNotice(translate("customer:seatSelectionPage_hangVeNayVuaHetHoacKhong"));
      toast.error(translate("customer:seatSelectionPage_hangVeNayVuaHetHoacKhong"));
      refresh();
      return;
    }
    if (delta < 0 && currentQuantity <= 0) return;

    setSelectedZone(ticketType.id);
    setZoneLoading((current) => ({
      ...current,
      [ticketType.id]: delta > 0 ? 'reserve' : 'release',
    }));

    try {
      if (delta > 0) {
        await reserveTicket(id, ticketType.id, 1, admission.queueAccessToken);
        setHeldQuantities((current) => ({
          ...current,
          [ticketType.id]: (current[ticketType.id] ?? 0) + 1,
        }));
      } else {
        await releaseTicket(id, ticketType.id, 1, admission.queueAccessToken);
        setHeldQuantities((current) => {
          const nextQuantity = Math.max(0, (current[ticketType.id] ?? 0) - 1);
          return { ...current, [ticketType.id]: nextQuantity };
        });
      }
      refresh();
    } catch (requestError) {
      showReserveFailure(requestError);
    } finally {
      setZoneLoading((current) => {
        const next = { ...current };
        delete next[ticketType.id];
        return next;
      });
    }
  }

  function continueToCheckout() {
    if (!concert || selectionCountdown.isExpired) return;
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
        queueAccessToken: queueAdmission?.queueAccessToken,
        sessionExpiresAt: queueAdmission?.sessionExpiresAt,
      },
    });
  }

  async function leaveSelection() {
    if (!id) return;
    const admission = getStoredQueueAdmission(id);
    if (admission) {
      try {
        await releaseAllHolds(id, admission.queueAccessToken);
      } catch {
        // The hold cleanup job will release expired holds if the explicit release misses.
      }
    }
    try {
      await leaveQueue(id);
    } catch {
      // The backend session still expires by TTL if the explicit leave request misses.
    }
    clearStoredQueueAdmission();
    setHeldQuantities({});
    navigate(`/concerts/${id}`, { replace: true });
  }

  if (concertLoading || availabilityLoading)
    return (
      <div className="selection-loading page-width">
        <div className="event-skeleton">
          <div />
          <span />
          <span />
        </div>
      </div>
    );
  if (error || initialLoadFailed || !concert) {
    return (
      <div className="selection-error page-width state-panel">
        <span className="state-icon">!</span>
        <h1>{translate("customer:seatSelectionPage_soDoChoKhongKhaDung")}</h1>
        <p>
          {error ??
            (initialLoadFailed
              ? translate("customer:seatSelectionPage_khongTheTaiTinhTrangVe")
              : translate("customer:seatSelectionPage_khongTimThayThongTinConcert"))}
        </p>
        <button
          className="button button-primary"
          type="button"
          onClick={() => setReloadKey((value) => value + 1)}
        >
          {translate("customer:seatSelectionPage_thuLai")}
        </button>
        <Link className="text-link" to="/">
          {translate("customer:seatSelectionPage_quayLaiDanhSachConcert")}
        </Link>
      </div>
    );
  }

  return (
    <div className="selection-page page-width">
      <div className="flow-topbar">
        <button className="back-link" type="button" onClick={() => void leaveSelection()}>
          {'<'} {translate("customer:seatSelectionPage_chiTietSuKien")}
        </button>
        <div className="flow-steps" aria-label={translate("customer:seatSelectionPage_tienTrinhDatVe")}>
          <span className="flow-step active">
            <b>1</b><i>{translate("customer:seatSelectionPage_ve")}</i>
          </span>
          <b className="flow-step-connector" />
          <span className="flow-step">
            <b>2</b><i>{translate("customer:seatSelectionPage_thanhToan")}</i>
          </span>
          <b className="flow-step-connector" />
          <span className="flow-step">
            <b>3</b><i>{translate("customer:seatSelectionPage_hoanTat")}</i>
          </span>
        </div>
        <div
          className={`timer countdown-timer ${selectionCountdown.isExpired ? 'expired' : selectionCountdown.isWarning ? 'warning' : updatesDelayed ? 'delayed' : ''}`}
          role="status"
          title={
            lastUpdatedAt ? translate("customer:seatSelectionPage_soLuongVeCapNhatLuc", { arg1: lastUpdatedAt.toLocaleTimeString(formatLanguage()) }) : undefined
          }
        >
          <span>{translate("customer:seatSelectionPage_thoiGianChonVe")}</span>
          <strong>{queueAdmission ? selectionCountdown.formatted : '--:--'}</strong>
        </div>
      </div>
      <header className="selection-header">
        <div>
          <p className="eyebrow">
            <span /> {translate("customer:seatSelectionPage_chonTraiNghiemCuaBan")}
          </p>
          <h1>{concertTitle(concert)}</h1>
          <p>
            {eventDate.format(new Date(concert.eventDate))} / {concert.venueName}
          </p>
        </div>
      </header>
      <div className="selection-layout">
        <section className="zone-map-panel" aria-labelledby="zone-map-title">
          <div className="panel-heading">
            <div>
              <span>{translate("customer:seatSelectionPage_soDoSvgTuongTac")}</span>
              <h2 id="zone-map-title">{translate("customer:seatSelectionPage_chonPhanKhu")}</h2>
            </div>
            <div className="map-legend">
              <i /> {translate("customer:seatSelectionPage_conVe")} <i /> {translate("customer:seatSelectionPage_dangChon")} <i /> {translate("customer:seatSelectionPage_hetVe")}
            </div>
          </div>
          <ConcertSeatMap
            svg={concert.seatMapSvg}
            selectedTicketTypeId={selectedZone}
            disabledTicketTypeIds={soldOutTicketTypeIds}
            onZoneSelect={setSelectedZone}
          />
          <p className="map-note">{translate("customer:seatSelectionPage_chonPhanKhuTrenSoDoHoac")}</p>
        </section>
        <aside className="ticket-picker">
          <div className="panel-heading">
            <div>
              <span>{translate("customer:seatSelectionPage_chonHangVe")}</span>
              <h2>{translate("customer:seatSelectionPage_chonVe")}</h2>
            </div>
          </div>
          {inventoryNotice ? (
            <div className="inventory-notice" role="status">
              <p>{inventoryNotice}</p>
              <button
                type="button"
                onClick={() => setInventoryNotice(null)}
                aria-label={translate("customer:seatSelectionPage_dongCapNhatTinhTrangVe")}
              >
                x
              </button>
            </div>
          ) : null}
          <div className="zone-list">
            {ticketTypes.map((ticketType) => {
              const quantity = heldQuantities[ticketType.id] ?? 0;
              const loadingAction = zoneLoading[ticketType.id];
              const soldOut = ticketType.availableQty === 0;
              const canReserveMore =
                quantity < ticketType.maxPerAccount && ticketType.availableQty > 0;
              return (
                <div
                  className={`zone-item ${selectedZone === ticketType.id ? 'focused' : ''} ${loadingAction ? 'zone-item-loading' : ''}`}
                  key={ticketType.id}
                >
                  <button
                    className="zone-focus"
                    type="button"
                    onClick={() => setSelectedZone(ticketType.id)}
                    disabled={soldOut && quantity === 0}
                  >
                    <i style={{ background: ticketType.zoneColor }} />
                    <span>
                      <strong>{ticketType.name}</strong>
                      <small>
                        {quantity > 0
                          ? translate("customer:seatSelectionPage_veDangGiu", { count: quantity })
                          : translate("customer:seatSelectionPage_toiDaVeTaiKhoan", { arg1: ticketType.maxPerAccount })}
                      </small>
                    </span>
                  </button>
                  <div className="zone-price">
                    <strong>{currency.format(ticketType.price)}</strong>
                    <small className={soldOut ? 'is-sold-out' : 'is-available'}>
                      {soldOut ? translate("customer:seatSelectionPage_hetVe") : translate("customer:seatSelectionPage_conVe")}
                    </small>
                  </div>
                  <div className="quantity-control" aria-busy={loadingAction ? 'true' : undefined}>
                    <button
                      type="button"
                      aria-label={translate("customer:seatSelectionPage_boMotVe", { arg1: ticketType.name })}
                      disabled={quantity === 0 || Boolean(loadingAction)}
                      onClick={() => void updateQuantity(ticketType, -1)}
                    >
                      -
                    </button>
                    <span aria-live="polite">{quantity}</span>
                    <button
                      type="button"
                      aria-label={translate("customer:seatSelectionPage_themMotVe", { arg1: ticketType.name })}
                      disabled={!canReserveMore || Boolean(loadingAction)}
                      onClick={() => void updateQuantity(ticketType, 1)}
                    >
                      +
                    </button>
                  </div>
                  {loadingAction ? (
                    <span className="zone-hold-status" role="status">
                      {loadingAction === 'reserve' ? translate("customer:seatSelectionPage_dangGiu") : translate("customer:seatSelectionPage_dangGiaiPhong")}
                    </span>
                  ) : null}
                </div>
              );
            })}
          </div>
          <div className="selection-summary">
            <div>
              <span>
                {ticketCount} {translate("customer:seatSelectionPage_ve_2")}
              </span>
              <strong>{currency.format(subtotal)}</strong>
            </div>
            <div
              className={`hold-timer ${selectionCountdown.isExpired ? 'expired' : selectionCountdown.isWarning ? 'warning' : ''}`}
              role="status"
            >
              <span>{translate("customer:seatSelectionPage_thoiGianChonVe")}</span>
              <strong>{queueAdmission ? selectionCountdown.formatted : '--:--'}</strong>
            </div>
            {selectionCountdown.isWarning && !selectionCountdown.isExpired ? (
              <p className="timer-warning-copy">{translate("customer:seatSelectionPage_phienMuaVe10PhutCuaBan")}</p>
            ) : null}
            {selection.length ? (
              <ul className="held-ticket-list" aria-label={translate("customer:seatSelectionPage_veDangGiu_2")}>
                {selection.map((item) => (
                  <li key={item.id}>
                    <span>{item.name}</span>
                    <strong>{translate("customer:seatSelectionPage_dangGiu_2")} {item.quantity} {translate("customer:seatSelectionPage_ve_2")}</strong>
                  </li>
                ))}
              </ul>
            ) : null}
            <button
              className="button button-primary button-block"
              type="button"
              disabled={!ticketCount || !queueAdmission || selectionCountdown.isExpired}
              onClick={continueToCheckout}
            >
              {translate("customer:seatSelectionPage_tiepTucThanhToan")} <span aria-hidden="true">-&gt;</span>
            </button>
          </div>
        </aside>
      </div>
    </div>
  );
}
