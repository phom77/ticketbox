import { translate } from '../../i18n';
import { useTranslation } from 'react-i18next';
import { concertTitle } from '../../features/concert/concertText';
import { useEffect, useRef, useState } from 'react';
import { Link, useLocation, useNavigate, useSearchParams } from 'react-router-dom';
import { ApiClientError } from '../../api/client';
import { eventPath, performancePath } from '../../api/performances';
import { checkoutPresentation } from '../../features/performance/checkoutPresentation';
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
import {
  clearPendingPayment,
  orderWindowExpired,
  paymentStillVerifying,
  readPendingPayment,
  rememberPendingPayment,
  type CheckoutEvent,
} from '../../features/ticket/checkoutPayment';
import { checkoutRequestKey, clearCheckoutRequest, createOrRecoverOrder } from '../../features/ticket/checkoutRecovery';
import { currency } from '../../data/formatters';
import { useCountdown } from '../../hooks/useCountdown';
import { CheckoutEventTime, CheckoutOrderLines, CheckoutStatusPanel } from './CheckoutDetails';
import type { CheckoutSelection } from './SeatSelectionPage';

type CheckoutState = {
  event: CheckoutEvent;
  selection: CheckoutSelection[];
  queueAccessToken?: string;
  sessionExpiresAt?: string;
};

type ResumeProblem = 'pending' | 'expiredPending' | 'closed' | 'missing' | 'unavailable';

const paymentOptions: Array<{
  value: PaymentProvider;
  title: string;
  copy: string;
}> = [
  {
    value: 'MOCK',
    get title() { return translate("customer:checkoutPage_thanhToanDemo"); },
    get copy() { return translate("customer:checkoutPage_hoanTatThanhToanNgayTrongMoi"); },
  },
  {
    value: 'VNPAY',
    title: 'VNPAY',
    get copy() { return translate("customer:checkoutPage_tiepTucSangTrangThanhToanVnpay"); },
  },
  {
    value: 'MOMO',
    title: 'MoMo',
    get copy() { return translate("customer:checkoutPage_tiepTucSangTrangThanhToanMomo"); },
  },
];

export function CheckoutPage() {
  useTranslation();
  const location = useLocation();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const state = location.state as CheckoutState | null;
  const resumeOrderId = searchParams.get('orderId');
  const [event, setEvent] = useState<CheckoutEvent | null>(state?.event ?? null);
  const [selection, setSelection] = useState<CheckoutSelection[]>(state?.selection ?? []);
  const [restoringOrder, setRestoringOrder] = useState(Boolean(resumeOrderId));
  const [resumeUnavailable, setResumeUnavailable] = useState<ResumeProblem | null>(null);
  const [resumeRefreshKey, setResumeRefreshKey] = useState(0);
  const storedAdmission = event ? getStoredQueueAdmission(event.id) : null;
  const queueAccessToken = state?.queueAccessToken ?? storedAdmission?.queueAccessToken;
  const [requestedProvider, setProvider] = useState<PaymentProvider>('MOCK');
  const [providers, setProviders] = useState<PaymentProvider[] | null>(null);
  const [providerError, setProviderError] = useState(false);
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
  const paymentCountdown = useCountdown(createdOrder?.expiresAt, 180);
  const displayedTotal =
    createdOrder?.totalAmount ??
    selection.reduce((total, item) => total + item.price * item.quantity, 0);

  useEffect(() => {
    const controller = new AbortController();
    setProviders(null);
    setProviderError(false);
    void getPaymentProviders(controller.signal).then((result) => {
      if (!controller.signal.aborted) setProviders(result);
    }).catch(() => {
      if (!controller.signal.aborted) setProviderError(true);
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
    setCreatedOrder((current) => current?.id === activeResumeOrderId ? current : null);

    async function restorePendingOrder() {
      try {
        const order = await getOrder(activeResumeOrderId, controller.signal);
        if (!active) return;
        if (order.status === 'PAID') {
          clearPendingPayment(order.id);
          navigate('/booking-confirmation', { replace: true, state: { orderId: order.id } });
          return;
        }

        const [presentation, paymentStatus] = await Promise.all([
          checkoutPresentation(order, controller.signal),
          getPaymentStatus(order.id, controller.signal).catch(() => null),
        ]);
        if (!active) return;
        const { event: restoredEvent, selection: restoredSelection } = presentation;

        setEvent(restoredEvent);
        setCreatedOrder(order);
        if (!paymentStatus) {
          setResumeUnavailable(orderWindowExpired(order) ? 'expiredPending' : 'unavailable');
          return;
        }
        if (paymentStillVerifying(paymentStatus.attemptState)) {
          setResumeUnavailable(orderWindowExpired(order) ? 'expiredPending' : 'pending');
          return;
        }
        if (order.status !== 'AWAITING_PAYMENT' || orderWindowExpired(order)) {
          clearPendingPayment(order.id);
          setResumeUnavailable('closed');
          return;
        }
        setPaymentFailed(paymentStatus.attemptState === 'FAILED');
        setLockedProvider(null);
        const pendingPayment = readPendingPayment();
        if (paymentStatus.provider) {
          setProvider(paymentStatus.provider);
          if (paymentStatus.attemptId) setLockedProvider(paymentStatus.provider);
        } else if (pendingPayment?.orderId === order.id && pendingPayment.provider) {
          setProvider(pendingPayment.provider);
        }
        setSelection(restoredSelection);
      } catch (requestError) {
        if (!active || (requestError instanceof DOMException && requestError.name === 'AbortError')) return;
        setResumeUnavailable(
          requestError instanceof ApiClientError && (requestError.status === 404 || requestError.status === 403)
            ? 'missing'
            : 'unavailable',
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
    if (resumeOrderId || !event || !selection.length || creationStarted.current) return;

    if (!queueAccessToken) {
      clearStoredQueueAdmission();
      setError(translate("customer:checkoutPage_phienMuaVeDaHetHanDang"));
      window.setTimeout(
        () => navigate((event.eventId ? performancePath(event.eventId, event.id) : `/concerts/${event.id}`) + '/waiting-room', { replace: true }),
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
              () => navigate((event.eventId ? performancePath(event.eventId, event.id) : `/concerts/${event.id}`) + '/waiting-room', { replace: true }),
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

  if (restoringOrder) {
    return (
      <CheckoutStatusPanel
        announce
        title={translate("customer:checkoutPage_dangKhoiPhucDonThanhToan")}
        body={translate("customer:checkoutPage_ticketboxDangKiemTraTrangThaiMoi")}
      />
    );
  }

  if (resumeUnavailable) {
    const pending = resumeUnavailable === 'pending' || resumeUnavailable === 'expiredPending';
    const expired = resumeUnavailable === 'expiredPending' ||
      (resumeUnavailable === 'closed' && createdOrder && orderWindowExpired(createdOrder));
    const title = expired ? translate("customer:paymentResultPage_deadlinePassed")
      : pending ? translate("customer:paymentResultPage_confirming")
        : translate("customer:checkoutPage_khongTheTiepTucThanhToan");
    const body = {
      pending: translate("customer:checkoutPage_paymentPending"),
      expiredPending: translate("customer:paymentResultPage_expiredPending"),
      closed: translate("customer:checkoutPage_donHangNayDaHetHanHoac"),
      missing: translate("customer:checkoutPage_khongTimThayDonThanhToanNay"),
      unavailable: translate("customer:checkoutPage_khongTheKhoiPhucDonChoThanh"),
    }[resumeUnavailable];

    return (
      <CheckoutStatusPanel title={title} body={body} orderId={createdOrder?.id}>
        <div className="purchase-status-actions">
          {resumeUnavailable === 'pending' && (
            <Link className="button button-primary" to={`/payment/result?orderId=${encodeURIComponent(resumeOrderId ?? '')}`}>
              {translate("customer:checkoutPage_kiemTraTrangThaiDon")}
            </Link>
          )}
          {resumeUnavailable === 'unavailable' && (
            <button className="button button-secondary" type="button" onClick={() => setResumeRefreshKey((value) => value + 1)}>
              {translate("customer:checkoutPage_kiemTraTrangThaiDon")}
            </button>
          )}
          <Link className={`button ${pending && !expired ? 'button-secondary' : 'button-primary'}`} to="/profile?tab=orders">
            {translate("customer:checkoutPage_xemLichSuDonHang")}
          </Link>
        </div>
      </CheckoutStatusPanel>
    );
  }

  if (!event || !selection.length) {
    return (
      <CheckoutStatusPanel
        title={translate("customer:checkoutPage_chuaChonVe")}
        body={translate("customer:checkoutPage_chonKhuVeVaSoLuongTruoc")}
      >
        <div className="purchase-status-actions">
          <Link className="button button-primary" to="/">{translate("customer:checkoutPage_duyetConcert")}</Link>
        </div>
      </CheckoutStatusPanel>
    );
  }

  if (paymentFailed && createdOrder) {
    return (
      <CheckoutStatusPanel
        title={translate("customer:checkoutPage_phienThanhToanDaThatBai")}
        body={translate("customer:checkoutPage_congThanhToanDaBaoGiaoDich")}
        orderId={createdOrder.id}
      >
        {error && <p className="purchase-error" role="alert">{error}</p>}
        <div className="purchase-status-actions">
          <button className="button button-primary" type="button" disabled={cancelling}
            onClick={() => void restartAfterFailedPayment()}>
            {cancelling ? translate("customer:checkoutPage_dangHuyDon") : translate("customer:checkoutPage_huyDonVaChonVeLai")}
          </button>
          <button className="button button-secondary" type="button" disabled={cancelling}
            onClick={() => setResumeRefreshKey((value) => value + 1)}>
            {translate("customer:checkoutPage_kiemTraTrangThaiDon")}
          </button>
          <Link className="button button-secondary" to="/profile?tab=orders">
            {translate("customer:checkoutPage_xemLichSuDonHang")}
          </Link>
        </div>
      </CheckoutStatusPanel>
    );
  }

  async function restartAfterFailedPayment() {
    if (!createdOrder || !event || cancelling) return;
    setCancelling(true);
    setError(null);
    try {
      const order = await cancelOrder(createdOrder.id);
      if (order.status === 'PAID') {
        clearPendingPayment(order.id);
        navigate('/booking-confirmation', { replace: true, state: { event, orderId: order.id } });
        return;
      }
      if (order.status !== 'CANCELLED') {
        setResumeRefreshKey((value) => value + 1);
        setCancelling(false);
        return;
      }
      clearPendingPayment(order.id);
      clearStoredQueueAdmission();
      navigate((event.eventId ? performancePath(event.eventId, event.id) : `/concerts/${event.id}`) + '/waiting-room', { replace: true });
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
    if (processing || cancelling || creatingOrder) return;
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
      if (paidOrder.status !== 'PAID') {
        navigate(`/payment/result?orderId=${encodeURIComponent(createdOrder.id)}`);
        return;
      }

      clearPendingPayment(paidOrder.id);
      navigate('/booking-confirmation', {
        state: { event, orderId: paidOrder.id },
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
      if (createdOrder) {
        const order = await cancelOrder(createdOrder.id);
        if (order.status === 'PAID') {
          clearPendingPayment(order.id);
          navigate('/booking-confirmation', { replace: true, state: { event, orderId: order.id } });
          return;
        }
        if (order.status !== 'CANCELLED') {
          setResumeRefreshKey((value) => value + 1);
          setCancelling(false);
          return;
        }
        clearPendingPayment(order.id);
      }
      try {
        await leaveQueue(event.id);
      } catch {
        // Queue session has a backend TTL fallback.
      }
      clearStoredQueueAdmission();
      navigate(event.eventId ? eventPath(event.eventId) : `/concerts/${event.id}`, { replace: true });
    } catch {
      setError(translate("customer:checkoutPage_khongTheRoiTrangThanhToanAn"));
      setCancelling(false);
    }
  }

  const providerIssue = providerError ? translate("customer:checkoutPage_khongTheTaiCongThanhToan")
    : providers !== null && !provider ? translate("customer:checkoutPage_congThanhToanChuaSanSang") : '';
  const actionLabel = paymentCountdown.isExpired
    ? translate("customer:checkoutPage_daHetThoiGianThanhToan_2")
    : !createdOrder
      ? translate(creatingOrder ? "customer:checkoutPage_dangTaoDon" : "customer:checkoutPage_orderNotReady")
      : processing
        ? provider === 'MOCK'
          ? translate("customer:checkoutPage_dangHoanTatThanhToan")
          : translate("customer:checkoutPage_dangMo", { arg1: provider })
        : provider
          ? translate("customer:checkoutPage_tiepTucVoi", {
            arg1: provider === 'MOCK' ? translate("customer:checkoutPage_thanhToanDemo_2") : provider === 'MOMO' ? 'MoMo' : provider,
          })
          : translate(providers === null && !providerError
            ? "customer:checkoutPage_dangTaiCongThanhToan"
            : "customer:checkoutPage_chuaCoCongThanhToan");

  return (
    <section className="buyer-page purchase-page page-width purchase-checkout" aria-labelledby="checkout-title">
      <header className="purchase-header">
        <div>
          <h1 id="checkout-title">{translate("customer:checkoutPage_thanhToan")}</h1>
          <p className="purchase-step" aria-current="step">{translate("customer:checkoutPage_paymentStep")}</p>
          <p className="purchase-checkout-event">{concertTitle(event)}</p>
          <CheckoutEventTime date={event.date} venue={event.venue} />
        </div>
        {createdOrder && (
          <div className="purchase-deadline" data-state={paymentCountdown.isExpired ? 'expired' : paymentCountdown.isWarning ? 'warning' : undefined}>
            <span>{translate("customer:checkoutPage_thoiGianThanhToan")}</span>
            {paymentCountdown.isExpired
              ? <strong>{translate("customer:checkoutPage_deadlinePassed")}</strong>
              : <strong role="timer" aria-live="off">{paymentCountdown.formatted}</strong>}
          </div>
        )}
      </header>

      {paymentCountdown.isExpired && (
        <div className="purchase-panel purchase-checkout-notice">
          <p role="alert">{translate("customer:checkoutPage_thoiGianThanhToanDaHetVui")}</p>
          <Link className="button button-secondary" to="/profile?tab=orders">
            {translate("customer:checkoutPage_xemLichSuDonHang")}
          </Link>
        </div>
      )}
      {error && (
        <div className="purchase-panel purchase-checkout-notice">
          <p role="alert">{error}</p>
          {creationNeedsRecovery && (
            <div className="purchase-status-actions">
              <button className="button button-secondary" type="button" disabled={creatingOrder}
                onClick={() => setCreationRetry((value) => value + 1)}>
                {translate("customer:checkoutPage_kiemTraLaiDon")}
              </button>
              <Link className="button button-secondary" to="/profile?tab=orders">
                {translate("customer:checkoutPage_xemLichSuDonHang")}
              </Link>
            </div>
          )}
        </div>
      )}

      <form className="purchase-columns" onSubmit={submitPayment}>
        <section className="purchase-panel purchase-payment-method" aria-labelledby="checkout-method-title">
          <h2 id="checkout-method-title">{translate("customer:checkoutPage_phuongThucThanhToan")}</h2>
          {creatingOrder && <p role="status">{translate("customer:checkoutPage_donHangCuaBanVanDangDuoc")}</p>}
          {providers === null && !providerError && <p role="status">{translate("customer:checkoutPage_dangTaiCongThanhToan")}</p>}
          {providerIssue && (
            <div className="purchase-provider-error">
              <p role="alert">{providerIssue}</p>
              <button className="button button-secondary" type="button" disabled={paymentCountdown.isExpired}
                onClick={() => setProviderReload((value) => value + 1)}>
                {translate("customer:checkoutPage_thuLai")}
              </button>
            </div>
          )}
          {allowed.length > 0 && (
            <div className="purchase-payment-options" role="radiogroup" aria-labelledby="checkout-method-title">
              {paymentOptions.filter((option) => allowed.includes(option.value)).map((option) => (
                <label className="purchase-payment-option" data-selected={provider === option.value || undefined} key={option.value}>
                  <input
                    type="radio"
                    name="payment"
                    value={option.value}
                    checked={provider === option.value}
                    onChange={() => setProvider(option.value)}
                    disabled={paymentDisabled || (lockedProvider !== null && option.value !== lockedProvider)}
                  />
                  <span><strong>{option.title}</strong><small>{option.copy}</small></span>
                </label>
              ))}
            </div>
          )}
          {!paymentCountdown.isExpired && (
            <button className="button button-secondary purchase-checkout-back" type="button"
              disabled={processing || cancelling || creatingOrder || creationNeedsRecovery}
              onClick={() => void leaveCheckout()}>
              {translate(createdOrder ? "customer:checkoutPage_cancelAndReturn" : "customer:checkoutPage_chiTietSuKien")}
            </button>
          )}
        </section>

        <aside className="purchase-panel purchase-order-summary" aria-labelledby="checkout-summary-title">
          <h2 id="checkout-summary-title">{translate("customer:checkoutPage_orderSummary")}</h2>
          <CheckoutOrderLines order={createdOrder} selection={selection} />
          <div className="purchase-action-bar">
            <div className="purchase-order-total">
              <span>{translate(createdOrder ? "customer:checkoutPage_orderTotal" : "customer:checkoutPage_tongTamTinh")}</span>
              <strong>{currency.format(displayedTotal)}</strong>
            </div>
            <button className="button button-primary" type="submit" disabled={paymentDisabled}>
              {actionLabel}
            </button>
          </div>
          <BuyerInformationLinks />
        </aside>
      </form>
    </section>
  );
}
