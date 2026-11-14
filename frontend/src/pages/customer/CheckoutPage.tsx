import { translate } from '../../i18n';
import { useTranslation } from 'react-i18next';
import { concertTitle } from '../../features/concert/concertText';
import type { ConcertTranslations } from '../../api/concerts';
import { useEffect, useRef, useState } from 'react';
import { Link, useLocation, useNavigate, useSearchParams } from 'react-router-dom';
import { ApiClientError } from '../../api/client';
import { getConcert } from '../../api/concerts';
import {
  cancelOrder,
  completeMockPayment,
  getOrder,
  getPaymentStatus,
  getPaymentProviders,
  initiatePayment,
  type Order,
  type PaymentProvider,
} from '../../api/orders';
import { clearStoredQueueAdmission, getStoredQueueAdmission, leaveQueue } from '../../api/queue';
import { BuyerInformationLinks } from '../../components/BuyerInformationLinks';
import { RemoteImage } from '../../components/RemoteImage';
import { useToast } from '../../components/feedback/toast-context';
import { checkoutRequestKey, clearCheckoutRequest, createOrRecoverOrder } from '../../features/ticket/checkoutRecovery';
import { currency } from '../../data/formatters';
import { useCountdown } from '../../hooks/useCountdown';
import type { CheckoutSelection } from './SeatSelectionPage';

export type CheckoutEvent = {
  id: string;
  title: string;
  translations?: ConcertTranslations;
  venue: string;
  date: string;
  image: string | null;
};

export type CheckoutState = {
  event: CheckoutEvent;
  selection: CheckoutSelection[];
  queueAccessToken?: string;
  sessionExpiresAt?: string;
};

export const PENDING_PAYMENT_STORAGE_KEY = 'ticketbox.pending-payment';

type PendingPayment = {
  orderId: string;
  provider?: PaymentProvider;
};

function readPendingPayment(): PendingPayment | null {
  try {
    const value = sessionStorage.getItem(PENDING_PAYMENT_STORAGE_KEY);
    return value ? (JSON.parse(value) as PendingPayment) : null;
  } catch {
    return null;
  }
}

export function rememberPendingPayment(orderId: string, provider: PaymentProvider) {
  sessionStorage.setItem(PENDING_PAYMENT_STORAGE_KEY, JSON.stringify({ orderId, provider }));
}

const paymentOptions: Array<{
  value: PaymentProvider;
  title: string;
  copy: string;
  badge: string;
}> = [
  {
    value: 'MOCK',
    get title() { return translate("customer:checkoutPage_thanhToanDemo"); },
    get copy() { return translate("customer:checkoutPage_hoanTatThanhToanNgayTrongMoi"); },
    badge: 'DEMO',
  },
  {
    value: 'VNPAY',
    title: 'VNPAY',
    get copy() { return translate("customer:checkoutPage_tiepTucSangTrangThanhToanVnpay"); },
    badge: 'VNPAY',
  },
  {
    value: 'MOMO',
    title: 'MoMo',
    get copy() { return translate("customer:checkoutPage_tiepTucSangTrangThanhToanMomo"); },
    badge: 'MoMo',
  },
];

export function CheckoutPage() {
  useTranslation();
  const location = useLocation();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const toast = useToast();
  const state = location.state as CheckoutState | null;
  const resumeOrderId = searchParams.get('orderId');
  const [event, setEvent] = useState<CheckoutEvent | null>(state?.event ?? null);
  const [selection, setSelection] = useState<CheckoutSelection[]>(state?.selection ?? []);
  const [restoringOrder, setRestoringOrder] = useState(Boolean(resumeOrderId));
  const [resumeUnavailable, setResumeUnavailable] = useState<string | null>(null);
  const [resumeRefreshKey, setResumeRefreshKey] = useState(0);
  const storedAdmission = event ? getStoredQueueAdmission(event.id) : null;
  const queueAccessToken = state?.queueAccessToken ?? storedAdmission?.queueAccessToken;
  const [requestedProvider, setProvider] = useState<PaymentProvider>('MOCK');
  const [providers, setProviders] = useState<PaymentProvider[] | null>(null);
  const [providerError, setProviderError] = useState('');
  const [providerReload, setProviderReload] = useState(0);
  const [lockedProvider, setLockedProvider] = useState<PaymentProvider | null>(null);
  const allowed = providers ?? [];
  const preferred = lockedProvider ?? requestedProvider;
  const provider = allowed.includes(preferred) ? preferred : (lockedProvider ? null : allowed[0] ?? null);
  const [processing, setProcessing] = useState(false);
  const [cancelling, setCancelling] = useState(false);
  const [creatingOrder, setCreatingOrder] = useState(false);
  const [createdOrder, setCreatedOrder] = useState<Order | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [paymentFailed, setPaymentFailed] = useState(false);
  const [creationRetry, setCreationRetry] = useState(0);
  const [creationNeedsRecovery, setCreationNeedsRecovery] = useState(false);
  const idempotencyKey = useRef<string | null>(null);
  const creationStarted = useRef(false);
  const paymentWarningShown = useRef(false);
  const paymentExpiredShown = useRef(false);
  const paymentCountdown = useCountdown(createdOrder?.expiresAt, 180);
  const displayedTotal =
    createdOrder?.totalAmount ??
    selection.reduce((total, item) => total + item.price * item.quantity, 0);

  useEffect(() => {
    const controller = new AbortController();
    setProviders(null);
    setProviderError('');
    void getPaymentProviders(controller.signal).then((result) => {
      if (!controller.signal.aborted) setProviders(result);
    }).catch(() => {
      if (!controller.signal.aborted) setProviderError(translate("customer:checkoutPage_khongTheTaiCongThanhToan"));
    });
    return () => controller.abort();
  }, [providerReload]);

  useEffect(() => {
    const activeResumeOrderId = resumeOrderId ?? '';
    if (!activeResumeOrderId) {
      setRestoringOrder(false);
      return;
    }

    const controller = new AbortController();
    let active = true;
    setRestoringOrder(true);
    setResumeUnavailable(null);
    setPaymentFailed(false);
    setError(null);

    async function restorePendingOrder() {
      try {
        const order = await getOrder(activeResumeOrderId, controller.signal);
        const concert = await getConcert(order.concertId, controller.signal);
        if (!active) return;

        const restoredEvent: CheckoutEvent = {
          id: concert.id,
          title: concert.title,
          translations: concert.translations,
          venue: concert.venueName,
          date: concert.eventDate,
          image: concert.posterUrl,
        };
        const restoredSelection = order.items.map((item) => ({
          id: item.ticketTypeId,
          name: item.ticketTypeName,
          price: item.unitPrice,
          quantity: item.quantity,
        }));

        if (order.status === 'PAID') {
          sessionStorage.removeItem(PENDING_PAYMENT_STORAGE_KEY);
          navigate('/booking-confirmation', {
            replace: true,
            state: { event: restoredEvent, selection: restoredSelection, order },
          });
          return;
        }

        if (
          order.status !== 'AWAITING_PAYMENT' ||
          new Date(order.expiresAt).getTime() <= Date.now()
        ) {
          sessionStorage.removeItem(PENDING_PAYMENT_STORAGE_KEY);
          setEvent(restoredEvent);
          setResumeUnavailable(translate("customer:checkoutPage_donHangNayDaHetHanHoac"));
          return;
        }

        const paymentStatus = await getPaymentStatus(order.id, controller.signal);
        if (!active) return;
        setPaymentFailed(paymentStatus.attemptState === 'FAILED');
        const pendingPayment = readPendingPayment();
        if (paymentStatus.provider) {
          setProvider(paymentStatus.provider);
          if (paymentStatus.attemptId) setLockedProvider(paymentStatus.provider);
        } else if (pendingPayment?.orderId === order.id && pendingPayment.provider) {
          setProvider(pendingPayment.provider);
        }
        setEvent(restoredEvent);
        setSelection(restoredSelection);
        setCreatedOrder(order);
      } catch (requestError) {
        if (!active || (requestError instanceof DOMException && requestError.name === 'AbortError')) return;
        setResumeUnavailable(
          requestError instanceof ApiClientError && requestError.status === 404
            ? translate("customer:checkoutPage_khongTimThayDonThanhToanNay")
            : translate("customer:checkoutPage_khongTheKhoiPhucDonChoThanh"),
        );
      } finally {
        if (active) setRestoringOrder(false);
      }
    }

    void restorePendingOrder();
    return () => {
      active = false;
      controller.abort();
    };
  }, [navigate, resumeOrderId, resumeRefreshKey]);

  useEffect(() => {
    function restoreAfterBrowserBack() {
      // A return from VNPAY/MoMo can be restored from the browser back-forward
      // cache. Reset the in-flight UI state and re-read the server-owned order.
      setProcessing(false);
      setError(null);
      if (resumeOrderId) setResumeRefreshKey((current) => current + 1);
    }

    window.addEventListener('pageshow', restoreAfterBrowserBack);
    return () => window.removeEventListener('pageshow', restoreAfterBrowserBack);
  }, [resumeOrderId]);

  useEffect(() => {
    if (searchParams.get('payment') === 'failed') {
      setError(translate("customer:checkoutPage_thanhToanChuaHoanTatDonCua"));
    }
  }, [searchParams]);

  useEffect(() => {
    if (resumeOrderId || !event || !selection.length || creationStarted.current) return;

    if (!queueAccessToken) {
      clearStoredQueueAdmission();
      setError(translate("customer:checkoutPage_phienMuaVeDaHetHanDang"));
      window.setTimeout(
        () => navigate(`/concerts/${event.id}/waiting-room`, { replace: true }),
        900,
      );
      return;
    }

    let active = true;
    creationStarted.current = true;

    const timeoutId = window.setTimeout(() => {
      if (!active) return;
      setCreatingOrder(true);
      setCreationNeedsRecovery(false);
      setError(null);

      const items = selection.map((item) => ({ ticketTypeId: item.id, quantity: item.quantity }));
      const key = idempotencyKey.current ?? checkoutRequestKey(event.id, items, queueAccessToken);
      idempotencyKey.current = key;
      createOrRecoverOrder(
        event.id,
        items,
        key,
        queueAccessToken,
      )
        .then((order) => {
          if (!active) return;
          clearCheckoutRequest(key);
          setCreatedOrder(order);
          // The order is now holding the inventory, so its waiting-room slot is released for the next buyer.
          clearStoredQueueAdmission();
          navigate(`/checkout?orderId=${encodeURIComponent(order.id)}`, {
            replace: true,
            state: { event, selection },
          });
        })
        .catch((requestError: unknown) => {
          if (!active) return;
          creationStarted.current = false;

          if (
            requestError instanceof ApiClientError &&
            (requestError.status === 401 || requestError.status === 403)
          ) {
            clearStoredQueueAdmission();
            setError(translate("customer:checkoutPage_phienMuaVeDaHetHanDang"));
            window.setTimeout(
              () => navigate(`/concerts/${event.id}/waiting-room`, { replace: true }),
              900,
            );
            return;
          }

          if (requestError instanceof ApiClientError &&
              (requestError.status === 409 || requestError.status >= 500)) {
            setCreationNeedsRecovery(true);
            setError(
              translate("customer:checkoutPage_chuaTheXacNhanDonHangYeu"),
            );
            return;
          }

          setError(
            requestError instanceof Error
              ? requestError.message
              : translate("customer:checkoutPage_khongTheTaoDonHangCuaBan"),
          );
        })
        .finally(() => {
          if (active) setCreatingOrder(false);
        });
    }, 0);

    return () => {
      active = false;
      window.clearTimeout(timeoutId);
      creationStarted.current = false;
    };
  }, [creationRetry, event, navigate, queueAccessToken, resumeOrderId, selection]);

  useEffect(() => {
    if (!paymentCountdown.isWarning || paymentCountdown.isExpired || paymentWarningShown.current)
      return;
    paymentWarningShown.current = true;
    toast.error(translate("customer:checkoutPage_conDuoi3PhutDeHoanTat"));
  }, [paymentCountdown.isExpired, paymentCountdown.isWarning, toast]);

  useEffect(() => {
    if (!paymentCountdown.isExpired || paymentExpiredShown.current) return;
    paymentExpiredShown.current = true;
    setProcessing(false);
    setError(translate("customer:checkoutPage_thoiGianThanhToanDaHetVui"));
    toast.error(translate("customer:checkoutPage_daHetThoiGianThanhToan"));
  }, [paymentCountdown.isExpired, toast]);

  if (restoringOrder) {
    return (
      <section className="checkout-missing page-width state-panel" aria-live="polite">
        <span className="state-icon" aria-hidden="true">…</span>
        <h1>{translate("customer:checkoutPage_dangKhoiPhucDonThanhToan")}</h1>
        <p>{translate("customer:checkoutPage_ticketboxDangKiemTraTrangThaiMoi")}</p>
      </section>
    );
  }

  if (resumeUnavailable) {
    return (
      <section className="checkout-missing page-width state-panel">
        <span className="state-icon" aria-hidden="true">!</span>
        <h1>{translate("customer:checkoutPage_khongTheTiepTucThanhToan")}</h1>
        <p>{resumeUnavailable}</p>
        <div className="confirmation-actions">
          {event ? (
            <Link className="button button-primary" to={`/concerts/${event.id}`}>
              {translate("customer:checkoutPage_xemLaiConcert")}
            </Link>
          ) : null}
          <Link className="button button-secondary" to="/profile?tab=orders">
            {translate("customer:checkoutPage_xemDonHang")}
          </Link>
        </div>
      </section>
    );
  }

  if (!event || !selection.length) {
    return (
      <section className="checkout-missing page-width state-panel">
        <span className="state-icon" aria-hidden="true">
          !
        </span>
        <h1>{translate("customer:checkoutPage_chuaChonVe")}</h1>
        <p>{translate("customer:checkoutPage_chonKhuVeVaSoLuongTruoc")}</p>
        <Link className="button button-primary" to="/">
          {translate("customer:checkoutPage_duyetConcert")}
        </Link>
      </section>
    );
  }

  if (paymentFailed && createdOrder) {
    return (
      <section className="checkout-missing page-width state-panel" aria-live="polite">
        <span className="state-icon" aria-hidden="true">!</span>
        <h1>{translate("customer:checkoutPage_phienThanhToanDaThatBai")}</h1>
        <p>{translate("customer:checkoutPage_congThanhToanDaBaoGiaoDich")}</p>
        <p>{translate("customer:checkoutPage_maDon")} {createdOrder.id}</p>
        {error ? <p role="alert">{error}</p> : null}
        <div className="confirmation-actions">
          <button className="button button-primary" type="button" disabled={cancelling}
            onClick={() => void restartAfterFailedPayment()}>
            {cancelling ? translate("customer:checkoutPage_dangHuyDon") : translate("customer:checkoutPage_huyDonVaChonVeLai")}
          </button>
          <button className="button button-secondary" type="button" disabled={cancelling}
            onClick={() => setResumeRefreshKey(value => value + 1)}>
            {translate("customer:checkoutPage_kiemTraTrangThaiDon")}
          </button>
          <Link className="text-link" to="/profile?tab=orders">{translate("customer:checkoutPage_xemLichSuDonHang")}</Link>
        </div>
      </section>
    );
  }

  async function restartAfterFailedPayment() {
    if (!createdOrder || !event || cancelling) return;
    setCancelling(true);
    setError(null);
    try {
      await cancelOrder(createdOrder.id);
      sessionStorage.removeItem(PENDING_PAYMENT_STORAGE_KEY);
      clearStoredQueueAdmission();
      navigate(`/concerts/${event.id}/waiting-room`, { replace: true });
    } catch {
      // A late success can win the race with cancellation. Re-read before buying again.
      setError(translate("customer:checkoutPage_chuaTheHuyDonHayKiemTra"));
      setCancelling(false);
    }
  }

  async function waitForPaidOrder(orderId: string): Promise<Order> {
    for (let attempt = 0; attempt < 12; attempt += 1) {
      const order = await getOrder(orderId);
      if (order.status === 'PAID') return order;
      if (['EXPIRED', 'CANCELLED', 'PAYMENT_FAILED'].includes(order.status)) return order;
      await new Promise((resolve) => window.setTimeout(resolve, 750));
    }
    return getOrder(orderId);
  }

  async function submitPayment(formEvent: React.FormEvent<HTMLFormElement>) {
    formEvent.preventDefault();
    setError(null);

    if (!createdOrder) {
      setError(translate("customer:checkoutPage_donHangCuaBanVanDangDuoc"));
      return;
    }

    if (paymentFailed || paymentCountdown.isExpired) {
      setError(translate("customer:checkoutPage_thoiGianThanhToanDaHetVui"));
      return;
    }

    if (!provider) {
      setError(translate("customer:checkoutPage_congThanhToanChuaSanSang"));
      return;
    }

    setProcessing(true);

    try {
      rememberPendingPayment(createdOrder.id, provider);

      const payment = await initiatePayment(createdOrder.id, provider);
      if (payment.attemptState === 'FAILED') {
        setPaymentFailed(true);
        setProcessing(false);
        return;
      }
      if (payment.attemptState === 'PROCESSING' || payment.attemptState === 'UNKNOWN' ||
          payment.attemptState === 'SUCCEEDED' || payment.attemptState === 'RECONCILIATION_REQUIRED' ||
          payment.attemptState === 'REVIEW_REQUIRED') {
        navigate(`/payment/result?orderId=${encodeURIComponent(createdOrder.id)}&pending=true`);
        return;
      }
      if (!payment.paymentUrl) {
        throw new Error(translate("customer:checkoutPage_phienThanhToanChuaTheTiepTuc"));
      }

      if (provider === 'VNPAY' || provider === 'MOMO') {
        window.location.assign(payment.paymentUrl);
        return;
      }

      await completeMockPayment(payment.paymentUrl);
      const paidOrder = await waitForPaidOrder(createdOrder.id);
      sessionStorage.removeItem(PENDING_PAYMENT_STORAGE_KEY);

      if (paidOrder.status !== 'PAID') {
        navigate('/booking-confirmation?status=failed', {
          state: { event, selection, order: paidOrder },
        });
        return;
      }

      navigate('/booking-confirmation', {
        state: { event, selection, order: paidOrder },
      });
    } catch (requestError) {
      // A client timeout does not prove that the provider failed to create its session.
      if (requestError instanceof ApiClientError && requestError.status >= 500) {
        navigate(`/payment/result?orderId=${encodeURIComponent(createdOrder.id)}&pending=true`);
        return;
      }
      setError(
        requestError instanceof ApiClientError && requestError.status === 409
          ? requestError.message
          : requestError instanceof Error
            ? requestError.message
            : translate("customer:checkoutPage_khongTheHoanTatThanhToanCua"),
      );
      setProcessing(false);
    }
  }

  const paymentDisabled =
    processing || cancelling || creatingOrder || !createdOrder || paymentFailed || paymentCountdown.isExpired || !provider;

  async function leaveCheckout() {
    if (!event) return;
    if (processing || cancelling || creatingOrder) return;
    if (
      createdOrder &&
      !window.confirm(translate("customer:checkoutPage_roiTrangThanhToanDonHangNay"))
    )
      return;

    setCancelling(true);
    setError(null);
    try {
      if (createdOrder) await cancelOrder(createdOrder.id);
      try {
        await leaveQueue(event.id);
      } catch {
        // Queue session has a backend TTL fallback.
      }
      clearStoredQueueAdmission();
      navigate(`/concerts/${event.id}`, { replace: true });
    } catch {
      setError(translate("customer:checkoutPage_khongTheRoiTrangThanhToanAn"));
      setCancelling(false);
    }
  }

  return (
    <div className="checkout-page page-width">
      <div className="flow-topbar">
        <button
          className="back-link"
          type="button"
          disabled={processing || cancelling || creatingOrder}
          onClick={() => void leaveCheckout()}
        >
          {'<'} {translate("customer:checkoutPage_chiTietSuKien")}
        </button>
        <div className="flow-steps" aria-label={translate("customer:checkoutPage_tienTrinhDatVe")}>
          <span className="flow-step">
            <b>1</b><i>{translate("customer:checkoutPage_ve")}</i>
          </span>
          <b className="flow-step-connector" />
          <span className="flow-step active">
            <b>2</b><i>{translate("customer:checkoutPage_thanhToan")}</i>
          </span>
          <b className="flow-step-connector" />
          <span className="flow-step">
            <b>3</b><i>{translate("customer:checkoutPage_hoanTat")}</i>
          </span>
        </div>
        <div
          className={`secure-label countdown-timer ${paymentCountdown.isExpired ? 'expired' : paymentCountdown.isWarning ? 'warning' : ''}`}
          role="status"
        >
          <span>{translate("customer:checkoutPage_thoiGianThanhToan")}</span>
          <strong>{createdOrder ? paymentCountdown.formatted : '--:--'}</strong>
        </div>
      </div>

      <div className="checkout-heading">
        <p className="eyebrow">
          <span /> {translate("customer:checkoutPage_sapHoanTat")}
        </p>
        <h1>{translate("customer:checkoutPage_hoanTatDonHang")}</h1>
        <p>
          {translate("customer:checkoutPage_donHangDuocTaoTruocSauDo")}
        </p>
      </div>

      {error ? (
        <div className="checkout-error" role="alert">
          <p>{error}</p>
          {creationNeedsRecovery ? (
            <div className="confirmation-actions">
              <button className="button button-secondary" type="button" disabled={creatingOrder}
                onClick={() => setCreationRetry(value => value + 1)}>
                {translate("customer:checkoutPage_kiemTraLaiDon")}
              </button>
              <Link className="text-link" to="/profile?tab=orders">{translate("customer:checkoutPage_xemLichSuDonHang")}</Link>
            </div>
          ) : null}
        </div>
      ) : null}

      <form className="checkout-layout" onSubmit={submitPayment}>
        <div className="checkout-form">
          <section className="form-section">
            <div className="form-section-title">
              <span>01</span>
              <h2>{translate("customer:checkoutPage_phuongThucThanhToan")}</h2>
            </div>
            <div
              className={`payment-timer-card ${paymentCountdown.isExpired ? 'expired' : paymentCountdown.isWarning ? 'warning' : ''}`}
              role="status"
            >
              <span>{translate("customer:checkoutPage_thoiGianThanhToan")}</span>
              <strong>
                {createdOrder
                  ? paymentCountdown.formatted
                  : creatingOrder
                    ? translate("customer:checkoutPage_dangTaoDon")
                    : '--:--'}
              </strong>
              <p>
                {paymentCountdown.isExpired
                  ? translate("customer:checkoutPage_donHangNayKhongConThanhToan")
                  : paymentCountdown.isWarning
                    ? translate("customer:checkoutPage_hayHoanTatThanhToanSomTruoc")
                    : translate("customer:checkoutPage_banCo15PhutKeTuKhi")}
              </p>
            </div>
            {providers === null && !providerError ? <p role="status">{translate("customer:checkoutPage_dangTaiCongThanhToan")}</p> : null}
            {providerError || (providers !== null && !provider) ? (
              <p role="alert">{providerError || translate("customer:checkoutPage_congThanhToanChuaSanSang")}{' '}
                <button type="button" className="button button-secondary"
                  onClick={() => setProviderReload((value) => value + 1)}>{translate("customer:checkoutPage_thuLai")}</button>
              </p>
            ) : null}
            <div className="payment-options">
              {paymentOptions.filter((option) => allowed.includes(option.value)).map((option) => (
                <label
                  className={`payment-option ${provider === option.value ? 'selected' : ''}`}
                  key={option.value}
                >
                  <input
                    type="radio"
                    name="payment"
                    value={option.value}
                    checked={provider === option.value}
                    onChange={() => setProvider(option.value)}
                    disabled={paymentDisabled || (lockedProvider !== null && option.value !== lockedProvider)}
                  />
                  <span className={`payment-logo payment-${option.value.toLowerCase()}`}>
                    {option.badge}
                  </span>
                  <span>
                    <strong>{option.title}</strong>
                    <small>{option.copy}</small>
                  </span>
                </label>
              ))}
            </div>
          </section>
        </div>

        <aside className="order-summary">
          <div className="order-event">
            <RemoteImage src={event.image ?? undefined} alt="" width="240" height="180" />
            <div>
              <span>{translate("customer:checkoutPage_suKienCuaBan")}</span>
              <h2>{concertTitle(event)}</h2>
              <p>{event.venue}</p>
            </div>
          </div>
          <div className="summary-lines">
            {selection.map((item) => (
              <div key={item.id}>
                <span>
                  {item.quantity} x {item.name}
                </span>
                <strong>{currency.format(item.price * item.quantity)}</strong>
              </div>
            ))}
          </div>
          <div
            className={`hold-timer ${paymentCountdown.isExpired ? 'expired' : paymentCountdown.isWarning ? 'warning' : ''}`}
            role="status"
          >
            <span>{translate("customer:checkoutPage_thoiGianThanhToan")}</span>
            <strong>{createdOrder ? paymentCountdown.formatted : '--:--'}</strong>
          </div>
          <div className="summary-total">
            <span>{translate("customer:checkoutPage_tongTamTinh")}</span>
            <strong>{currency.format(displayedTotal)}</strong>
          </div>
          <button
            className="button button-primary button-block"
            type="submit"
            disabled={paymentDisabled}
          >
            {creatingOrder
              ? translate("customer:checkoutPage_dangTaoDon")
              : processing
                ? provider === 'MOCK'
                  ? translate("customer:checkoutPage_dangHoanTatThanhToan")
                  : translate("customer:checkoutPage_dangMo", { arg1: provider })
                : paymentCountdown.isExpired
                  ? translate("customer:checkoutPage_daHetThoiGianThanhToan_2")
                  : provider ? translate("customer:checkoutPage_tiepTucVoi", { arg1: provider === 'MOCK' ? translate("customer:checkoutPage_thanhToanDemo_2") : provider }) : translate("customer:checkoutPage_chuaCoCongThanhToan")}
          </button>
          <p className="secure-note">{translate("customer:checkoutPage_kiemTraTongTienVaHoanTat")}</p>
          <BuyerInformationLinks />
        </aside>
      </form>
    </div>
  );
}
