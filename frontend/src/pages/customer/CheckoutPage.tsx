import { useEffect, useRef, useState } from 'react';
import { Link, useLocation, useNavigate, useSearchParams } from 'react-router-dom';
import { ApiClientError } from '../../api/client';
import { getConcert } from '../../api/concerts';
import {
  cancelOrder,
  completeMockPayment,
  getOrder,
  getPaymentStatus,
  initiatePayment,
  type Order,
  type PaymentProvider,
} from '../../api/orders';
import { clearStoredQueueAdmission, getStoredQueueAdmission, leaveQueue } from '../../api/queue';
import { RemoteImage } from '../../components/RemoteImage';
import { useToast } from '../../components/feedback/toast-context';
import { checkoutRequestKey, clearCheckoutRequest, createOrRecoverOrder } from '../../features/ticket/checkoutRecovery';
import { currency } from '../../data/formatters';
import { useCountdown } from '../../hooks/useCountdown';
import type { CheckoutSelection } from './SeatSelectionPage';

export type CheckoutEvent = {
  id: string;
  title: string;
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
    title: 'Thanh toán demo',
    copy: 'Hoàn tất thanh toán ngay trong môi trường phát triển local.',
    badge: 'DEMO',
  },
  {
    value: 'VNPAY',
    title: 'VNPAY',
    copy: 'Tiếp tục an toàn sang trang thanh toán sandbox của VNPAY.',
    badge: 'VNPAY',
  },
  {
    value: 'MOMO',
    title: 'MoMo',
    copy: 'Tiếp tục an toàn sang trang thanh toán sandbox của MoMo.',
    badge: 'MoMo',
  },
];

export function CheckoutPage() {
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
  const [provider, setProvider] = useState<PaymentProvider>('MOCK');
  const [lockedProvider, setLockedProvider] = useState<PaymentProvider | null>(null);
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
          setResumeUnavailable('Đơn hàng này đã hết hạn hoặc không còn có thể thanh toán. Vé đã được trả về tồn kho.');
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
            ? 'Không tìm thấy đơn thanh toán này hoặc bạn không có quyền truy cập.'
            : 'Không thể khôi phục đơn chờ thanh toán. Vui lòng kiểm tra lại lịch sử đơn hàng.',
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
      setError('Thanh toán chưa hoàn tất. Đơn của bạn vẫn được giữ đến hết thời gian thanh toán.');
    }
  }, [searchParams]);

  useEffect(() => {
    if (resumeOrderId || !event || !selection.length || creationStarted.current) return;

    if (!queueAccessToken) {
      clearStoredQueueAdmission();
      setError('Phiên mua vé đã hết hạn. Đang đưa bạn về phòng chờ.');
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
            setError('Phiên mua vé đã hết hạn. Đang đưa bạn về phòng chờ.');
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
              'Chưa thể xác nhận đơn hàng. Yêu cầu có thể vẫn đang được xử lý. Hãy kiểm tra lại đơn trước khi chọn vé khác.',
            );
            return;
          }

          setError(
            requestError instanceof Error
              ? requestError.message
              : 'Không thể tạo đơn hàng của bạn.',
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
    toast.error('Còn dưới 3 phút để hoàn tất thanh toán.');
  }, [paymentCountdown.isExpired, paymentCountdown.isWarning, toast]);

  useEffect(() => {
    if (!paymentCountdown.isExpired || paymentExpiredShown.current) return;
    paymentExpiredShown.current = true;
    setProcessing(false);
    setError('Thời gian thanh toán đã hết. Vui lòng quay lại chọn vé và tạo đơn mới.');
    toast.error('Đã hết thời gian thanh toán.');
  }, [paymentCountdown.isExpired, toast]);

  if (restoringOrder) {
    return (
      <section className="checkout-missing page-width state-panel" aria-live="polite">
        <span className="state-icon" aria-hidden="true">…</span>
        <h1>Đang khôi phục đơn thanh toán</h1>
        <p>TicketBox đang kiểm tra trạng thái mới nhất của đơn hàng.</p>
      </section>
    );
  }

  if (resumeUnavailable) {
    return (
      <section className="checkout-missing page-width state-panel">
        <span className="state-icon" aria-hidden="true">!</span>
        <h1>Không thể tiếp tục thanh toán</h1>
        <p>{resumeUnavailable}</p>
        <div className="confirmation-actions">
          {event ? (
            <Link className="button button-primary" to={`/concerts/${event.id}`}>
              Xem lại concert
            </Link>
          ) : null}
          <Link className="button button-secondary" to="/profile">
            Xem đơn hàng
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
        <h1>Chưa chọn vé</h1>
        <p>Chọn khu vé và số lượng trước khi bắt đầu thanh toán.</p>
        <Link className="button button-primary" to="/">
          Duyệt concert
        </Link>
      </section>
    );
  }

  if (paymentFailed && createdOrder) {
    return (
      <section className="checkout-missing page-width state-panel" aria-live="polite">
        <span className="state-icon" aria-hidden="true">!</span>
        <h1>Phiên thanh toán đã thất bại</h1>
        <p>Cổng thanh toán đã báo giao dịch thất bại. Hủy đơn hiện tại để trả vé và bắt đầu chọn vé lại.</p>
        <p>Mã đơn: {createdOrder.id}</p>
        {error ? <p role="alert">{error}</p> : null}
        <div className="confirmation-actions">
          <button className="button button-primary" type="button" disabled={cancelling}
            onClick={() => void restartAfterFailedPayment()}>
            {cancelling ? 'Đang hủy đơn...' : 'Hủy đơn và chọn vé lại'}
          </button>
          <button className="button button-secondary" type="button" disabled={cancelling}
            onClick={() => setResumeRefreshKey(value => value + 1)}>
            Kiểm tra trạng thái đơn
          </button>
          <Link className="text-link" to="/profile">Xem lịch sử đơn hàng</Link>
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
      setError('Chưa thể hủy đơn. Hãy kiểm tra trạng thái đơn trước khi mua lại.');
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
      setError('Đơn hàng của bạn vẫn đang được chuẩn bị. Vui lòng đợi một chút.');
      return;
    }

    if (paymentFailed || paymentCountdown.isExpired) {
      setError('Thời gian thanh toán đã hết. Vui lòng quay lại chọn vé và tạo đơn mới.');
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
        throw new Error('Phiên thanh toán chưa thể tiếp tục. Hãy kiểm tra trạng thái đơn hàng.');
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
            : 'Không thể hoàn tất thanh toán của bạn.',
      );
      setProcessing(false);
    }
  }

  const paymentDisabled =
    processing || cancelling || creatingOrder || !createdOrder || paymentFailed || paymentCountdown.isExpired;

  async function leaveCheckout() {
    if (!event) return;
    if (processing || cancelling || creatingOrder) return;
    if (
      createdOrder &&
      !window.confirm('Rời trang thanh toán? Đơn hàng này sẽ bị hủy và vé của bạn sẽ được trả lại.')
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
      setError('Không thể rời trang thanh toán an toàn. Vui lòng thử lại.');
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
          {'<'} Chi tiết sự kiện
        </button>
        <div className="flow-steps" aria-label="Tiến trình đặt vé">
          <span className="flow-step">
            <b>1</b><i>Vé</i>
          </span>
          <b className="flow-step-connector" />
          <span className="flow-step active">
            <b>2</b><i>Thanh toán</i>
          </span>
          <b className="flow-step-connector" />
          <span className="flow-step">
            <b>3</b><i>Hoàn tất</i>
          </span>
        </div>
        <div
          className={`secure-label countdown-timer ${paymentCountdown.isExpired ? 'expired' : paymentCountdown.isWarning ? 'warning' : ''}`}
          role="status"
        >
          <span>Thời gian thanh toán</span>
          <strong>{createdOrder ? paymentCountdown.formatted : '--:--'}</strong>
        </div>
      </div>

      <div className="checkout-heading">
        <p className="eyebrow">
          <span /> Sắp hoàn tất
        </p>
        <h1>Hoàn tất đơn hàng.</h1>
        <p>
          Đơn hàng được tạo trước, sau đó bộ đếm thanh toán 15 phút bắt đầu theo thời hạn từ
          backend.
        </p>
      </div>

      {error ? (
        <div className="checkout-error" role="alert">
          <p>{error}</p>
          {creationNeedsRecovery ? (
            <div className="confirmation-actions">
              <button className="button button-secondary" type="button" disabled={creatingOrder}
                onClick={() => setCreationRetry(value => value + 1)}>
                Kiểm tra lại đơn
              </button>
              <Link className="text-link" to="/profile">Xem lịch sử đơn hàng</Link>
            </div>
          ) : null}
        </div>
      ) : null}

      <form className="checkout-layout" onSubmit={submitPayment}>
        <div className="checkout-form">
          <section className="form-section">
            <div className="form-section-title">
              <span>01</span>
              <h2>Phương thức thanh toán</h2>
            </div>
            <div
              className={`payment-timer-card ${paymentCountdown.isExpired ? 'expired' : paymentCountdown.isWarning ? 'warning' : ''}`}
              role="status"
            >
              <span>Thời gian thanh toán</span>
              <strong>
                {createdOrder
                  ? paymentCountdown.formatted
                  : creatingOrder
                    ? 'Đang tạo đơn...'
                    : '--:--'}
              </strong>
              <p>
                {paymentCountdown.isExpired
                  ? 'Đơn hàng này không còn thanh toán được.'
                  : paymentCountdown.isWarning
                    ? 'Hãy hoàn tất thanh toán sớm trước khi đơn hàng hết hạn.'
                    : 'Bạn có 15 phút kể từ khi đơn hàng được tạo.'}
              </p>
            </div>
            <div className="payment-options">
              {paymentOptions.map((option) => (
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
              <span>Sự kiện của bạn</span>
              <h2>{event.title}</h2>
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
            <span>Thời gian thanh toán</span>
            <strong>{createdOrder ? paymentCountdown.formatted : '--:--'}</strong>
          </div>
          <div className="summary-total">
            <span>Tổng tạm tính</span>
            <strong>{currency.format(displayedTotal)}</strong>
          </div>
          <button
            className="button button-primary button-block"
            type="submit"
            disabled={paymentDisabled}
          >
            {creatingOrder
              ? 'Đang tạo đơn...'
              : processing
                ? provider === 'MOCK'
                  ? 'Đang hoàn tất thanh toán...'
                  : `Đang mở ${provider}...`
                : paymentCountdown.isExpired
                  ? 'Đã hết thời gian thanh toán'
                  : `Tiếp tục với ${provider === 'MOCK' ? 'thanh toán demo' : provider}`}
          </button>
          <p className="secure-note">Kiểm tra tổng tiền và hoàn tất thanh toán trước khi thời gian giữ vé kết thúc.</p>
        </aside>
      </form>
    </div>
  );
}
