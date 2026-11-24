import { translate } from '../../i18n';
import { useTranslation } from 'react-i18next';
import { concertTitle } from '../../features/concert/concertText';
import { useEffect, useId, useRef, useState } from 'react';
import { Link, useLocation, useNavigate, useSearchParams } from 'react-router-dom';
import { ApiClientError } from '../../api/client';
import { checkoutPresentation } from '../../features/performance/checkoutPresentation';
import {
  cancelOrder,
  completeMockPayment,
  getPaymentProviders,
  initiatePayment,
  retryOrderPayment,
  type Order,
  type PaymentProvider,
} from '../../api/orders';
import { clearStoredQueueAdmission, getStoredQueueAdmission, leaveQueue } from '../../api/queue';
import { BuyerInformationLinks } from '../../components/BuyerInformationLinks';
import { AdminConfirmDialog } from '../../components/admin/AdminConfirmDialog';
import { useOrderPoster } from '../../features/performance/useOrderPoster';
import { termsUrl } from '../../features/ticket/buyerInformation';
import {
  clearPendingPayment,
  orderWindowExpired,
  readPendingPayment,
  rememberPendingPayment,
  type CheckoutEvent,
} from '../../features/ticket/checkoutPayment';
import {
  checkoutRequestKey,
  clearCheckoutRequest,
  createOrRecoverOrder,
} from '../../features/ticket/checkoutRecovery';
import { useCountdown } from '../../hooks/useCountdown';
import { HoldTimer } from '../../components/purchase/HoldTimer';
import { PurchaseProgress } from '../../components/purchase/PurchaseProgress';
import { purchasePaths } from '../../features/event/eventView';
import { AllInPriceNote } from '../../features/price/AllInPrice';
import { formatPrice } from '../../features/price/price';
import {
  confirmationPath,
  pollOrderOutcome,
  readOrderSnapshot,
  type OrderOutcomeKind,
} from '../../features/ticket/orderOutcome';
import { CheckoutOrderLines, CheckoutOrderReference, CheckoutStatusPanel } from './CheckoutDetails';
import {
  ContactSection,
  PaymentFailedBanner,
  PaymentMethodCards,
  SummaryEvent,
  TermsConsent,
} from './CheckoutParts';
import type { CheckoutSelection } from './SeatSelectionPage';

type CheckoutState = {
  event: CheckoutEvent;
  selection: CheckoutSelection[];
  queueAccessToken?: string;
  sessionExpiresAt?: string;
};

type ResumeProblem = 'pending' | 'expiredPending' | 'closed' | 'missing' | 'unavailable';

/** Checkout resume screens for each shared order outcome; `null` means the order can be paid. */
const resumeProblems: Record<Exclude<OrderOutcomeKind, 'paid'>, ResumeProblem | null> = {
  unavailable: 'unavailable',
  expiredPending: 'expiredPending',
  expired: 'closed',
  closed: 'closed',
  review: 'pending',
  verifying: 'pending',
  failed: null,
  payable: null,
};

const paymentOptions: Array<{
  value: PaymentProvider;
  title: string;
  copy: string;
}> = [
  {
    value: 'MOCK',
    get title() {
      return translate('customer:checkoutPage_thanhToanDemo');
    },
    get copy() {
      return translate('customer:checkoutPage_hoanTatThanhToanNgayTrongMoi');
    },
  },
  {
    value: 'VNPAY',
    title: 'VNPAY',
    get copy() {
      return translate('customer:checkoutPage_tiepTucSangTrangThanhToanVnpay');
    },
  },
  {
    value: 'MOMO',
    title: 'MoMo',
    get copy() {
      return translate('customer:checkoutPage_tiepTucSangTrangThanhToanMomo');
    },
  },
];

export function CheckoutPage() {
  useTranslation();
  const location = useLocation();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const methodTitleId = useId();
  const contactTitleId = useId();
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
  const provider = allowed.includes(preferred)
    ? preferred
    : lockedProvider
      ? null
      : (allowed[0] ?? null);
  const [processing, setProcessing] = useState(false);
  const [cancelling, setCancelling] = useState(false);
  const [creatingOrder, setCreatingOrder] = useState(false);
  const [createdOrder, setCreatedOrder] = useState<Order | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [paymentFailed, setPaymentFailed] = useState(false);
  const [creationRetry, setCreationRetry] = useState(0);
  const [retryingPayment, setRetryingPayment] = useState(false);
  const [cancelDialog, setCancelDialog] = useState<'leave' | 'restart' | null>(null);
  const [termsAccepted, setTermsAccepted] = useState(false);
  const [termsInvalid, setTermsInvalid] = useState(false);
  const failedHint = searchParams.get('payment') === 'failed';
  const [creationNeedsRecovery, setCreationNeedsRecovery] = useState(false);
  const idempotencyKey = useRef<string | null>(null);
  const creationStarted = useRef(false);
  const paymentCountdown = useCountdown(createdOrder?.expiresAt, 180);
  const poster = useOrderPoster(createdOrder, event?.image);
  const displayedTotal =
    createdOrder?.totalAmount ??
    selection.reduce((total, item) => total + item.price * item.quantity, 0);

  useEffect(() => {
    const controller = new AbortController();
    setProviders(null);
    setProviderError(false);
    void getPaymentProviders(controller.signal)
      .then((result) => {
        if (!controller.signal.aborted) setProviders(result);
      })
      .catch(() => {
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
    setCreatedOrder((current) => (current?.id === activeResumeOrderId ? current : null));

    async function restorePendingOrder() {
      try {
        const {
          order,
          payment: paymentStatus,
          outcome,
        } = await readOrderSnapshot(activeResumeOrderId, { signal: controller.signal });
        if (!active) return;
        if (outcome.settled) clearPendingPayment(order.id);
        if (outcome.kind === 'paid') {
          navigate(confirmationPath(order.id), { replace: true });
          return;
        }

        const presentation = await checkoutPresentation(order, controller.signal);
        if (!active) return;
        const { event: restoredEvent, selection: restoredSelection } = presentation;

        setEvent(restoredEvent);
        setCreatedOrder(order);
        const problem = resumeProblems[outcome.kind];
        if (problem || !paymentStatus) {
          setResumeUnavailable(problem ?? 'unavailable');
          return;
        }
        setPaymentFailed(outcome.kind === 'failed' || (failedHint && outcome.kind === 'payable'));
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
        if (!active || (requestError instanceof DOMException && requestError.name === 'AbortError'))
          return;
        setResumeUnavailable(
          requestError instanceof ApiClientError &&
            (requestError.status === 404 || requestError.status === 403)
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
  }, [navigate, resumeOrderId, resumeRefreshKey, failedHint]);

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
      setError(translate('customer:checkoutPage_phienMuaVeDaHetHanDang'));
      window.setTimeout(() => navigate(purchasePaths(event).waitingRoom, { replace: true }), 900);
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
      createOrRecoverOrder(event.id, items, key, queueAccessToken)
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
            setError(translate('customer:checkoutPage_phienMuaVeDaHetHanDang'));
            window.setTimeout(
              () => navigate(purchasePaths(event).waitingRoom, { replace: true }),
              900,
            );
            return;
          }

          if (
            requestError instanceof ApiClientError &&
            (requestError.status === 409 || requestError.status >= 500)
          ) {
            setCreationNeedsRecovery(true);
            setError(translate('customer:checkoutPage_chuaTheXacNhanDonHangYeu'));
            return;
          }

          setError(
            requestError instanceof Error
              ? requestError.message
              : translate('customer:checkoutPage_khongTheTaoDonHangCuaBan'),
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
        step="checkout"
        announce
        title={translate('customer:checkoutPage_dangKhoiPhucDonThanhToan')}
        body={translate('customer:checkoutPage_ticketboxDangKiemTraTrangThaiMoi')}
      />
    );
  }

  if (resumeUnavailable) {
    const pending = resumeUnavailable === 'pending' || resumeUnavailable === 'expiredPending';
    const expired =
      resumeUnavailable === 'expiredPending' ||
      (resumeUnavailable === 'closed' && createdOrder && orderWindowExpired(createdOrder));
    const title = expired
      ? translate('customer:orderOutcome_deadlinePassedTitle')
      : pending
        ? translate('customer:orderOutcome_confirmingTitle')
        : translate('customer:orderOutcome_cannotContinueTitle');
    const body = {
      pending: translate('customer:orderOutcome_pendingBody'),
      expiredPending: translate('customer:orderOutcome_expiredPendingBody'),
      closed: translate('customer:orderOutcome_closedBody'),
      missing: translate('customer:orderOutcome_resumeMissingBody'),
      unavailable: translate('customer:orderOutcome_resumeUnavailableBody'),
    }[resumeUnavailable];

    return (
      <CheckoutStatusPanel
        step="checkout"
        title={title}
        body={body}
        referenceCode={createdOrder?.referenceCode}
      >
        <div className="purchase-status-actions">
          {resumeUnavailable === 'pending' && (
            <Link
              className="button button-primary"
              to={`/payment/result?orderId=${encodeURIComponent(resumeOrderId ?? '')}`}
            >
              {translate('customer:orderOutcome_checkStatus')}
            </Link>
          )}
          {resumeUnavailable === 'unavailable' && (
            <button
              className="button button-secondary"
              type="button"
              onClick={() => setResumeRefreshKey((value) => value + 1)}
            >
              {translate('customer:orderOutcome_checkStatus')}
            </button>
          )}
          <Link
            className={`button ${pending && !expired ? 'button-secondary' : 'button-primary'}`}
            to="/profile?tab=orders"
          >
            {translate('customer:orderOutcome_viewOrderHistory')}
          </Link>
        </div>
      </CheckoutStatusPanel>
    );
  }

  if (!event || !selection.length) {
    return (
      <CheckoutStatusPanel
        step="tickets"
        title={translate('customer:checkoutPage_chuaChonVe')}
        body={translate('customer:checkoutPage_chonKhuVeVaSoLuongTruoc')}
      >
        <div className="purchase-status-actions">
          <Link className="button button-primary" to="/">
            {translate('customer:checkoutPage_duyetConcert')}
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
        navigate(confirmationPath(order.id), { replace: true });
        return;
      }
      if (order.status !== 'CANCELLED') {
        setResumeRefreshKey((value) => value + 1);
        setCancelling(false);
        return;
      }
      clearPendingPayment(order.id);
      clearStoredQueueAdmission();
      navigate(purchasePaths(event).waitingRoom, { replace: true });
    } catch {
      // A late success can win the race with cancellation. Re-read before buying again.
      setError(translate('customer:checkoutPage_chuaTheHuyDonHayKiemTra'));
      setCancelling(false);
    }
  }

  /** Reopens the same order for another payment attempt instead of cancelling it. */
  async function tryAnotherMethod() {
    if (!createdOrder || retryingPayment || cancelling) return;
    setRetryingPayment(true);
    setError(null);
    try {
      const order = await retryOrderPayment(createdOrder.id);
      setCreatedOrder(order);
      setPaymentFailed(false);
      const failedProvider = lockedProvider ?? provider;
      setLockedProvider(null);
      const alternative = allowed.find((option) => option !== failedProvider);
      if (alternative) setProvider(alternative);
      navigate(`/checkout?orderId=${encodeURIComponent(order.id)}`, {
        replace: true,
        state: { event, selection },
      });
    } catch {
      setError(translate('customer:checkout2_retryFailed'));
      setResumeRefreshKey((value) => value + 1);
    } finally {
      setRetryingPayment(false);
    }
  }

  async function waitForPaidOrder(orderId: string): Promise<Order> {
    const settled = await pollOrderOutcome(orderId, {
      attempts: 12,
      intervalMs: 750,
      includePayment: false,
      isFinal: ({ order }) =>
        ['PAID', 'EXPIRED', 'CANCELLED', 'PAYMENT_FAILED'].includes(order.status),
    });
    return (settled ?? (await readOrderSnapshot(orderId, { includePayment: false }))).order;
  }

  async function submitPayment(formEvent: React.FormEvent<HTMLFormElement>) {
    formEvent.preventDefault();
    if (processing || cancelling || creatingOrder) return;
    setError(null);

    if (!createdOrder) {
      setError(translate('customer:checkoutPage_donHangCuaBanVanDangDuoc'));
      return;
    }

    if (paymentFailed || paymentCountdown.isExpired) {
      setError(translate('customer:checkoutPage_thoiGianThanhToanDaHetVui'));
      return;
    }

    if (!provider) {
      setError(translate('customer:checkoutPage_congThanhToanChuaSanSang'));
      return;
    }

    if (termsUrl && !termsAccepted) {
      setTermsInvalid(true);
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
      if (
        payment.attemptState === 'PROCESSING' ||
        payment.attemptState === 'UNKNOWN' ||
        payment.attemptState === 'SUCCEEDED' ||
        payment.attemptState === 'RECONCILIATION_REQUIRED' ||
        payment.attemptState === 'REVIEW_REQUIRED'
      ) {
        navigate(`/payment/result?orderId=${encodeURIComponent(createdOrder.id)}&pending=true`);
        return;
      }
      if (!payment.paymentUrl) {
        throw new Error(translate('customer:checkoutPage_phienThanhToanChuaTheTiepTuc'));
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
      navigate(confirmationPath(paidOrder.id));
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
            : translate('customer:checkoutPage_khongTheHoanTatThanhToanCua'),
      );
      setProcessing(false);
    }
  }

  const paymentDisabled =
    processing ||
    cancelling ||
    creatingOrder ||
    retryingPayment ||
    !createdOrder ||
    paymentFailed ||
    paymentCountdown.isExpired ||
    !provider;

  async function leaveCheckout() {
    if (!event) return;
    if (processing || cancelling || creatingOrder) return;
    setCancelling(true);
    setError(null);
    try {
      if (createdOrder) {
        const order = await cancelOrder(createdOrder.id);
        if (order.status === 'PAID') {
          clearPendingPayment(order.id);
          navigate(confirmationPath(order.id), { replace: true });
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
      navigate(purchasePaths(event).details, { replace: true });
    } catch {
      setError(translate('customer:checkoutPage_khongTheRoiTrangThanhToanAn'));
      setCancelling(false);
    }
  }

  const providerIssue = providerError
    ? translate('customer:checkoutPage_khongTheTaiCongThanhToan')
    : providers !== null && !provider
      ? translate('customer:checkoutPage_congThanhToanChuaSanSang')
      : '';
  const actionLabel = paymentCountdown.isExpired
    ? translate('customer:checkoutPage_daHetThoiGianThanhToan_2')
    : !createdOrder
      ? translate(
          creatingOrder
            ? 'customer:checkoutPage_dangTaoDon'
            : 'customer:checkoutPage_orderNotReady',
        )
      : processing
        ? provider === 'MOCK'
          ? translate('customer:checkoutPage_dangHoanTatThanhToan')
          : translate('customer:checkoutPage_dangMo', { arg1: provider })
        : provider
          ? translate('customer:checkoutPage_tiepTucVoi', {
              arg1:
                provider === 'MOCK'
                  ? translate('customer:checkoutPage_thanhToanDemo_2')
                  : provider === 'MOMO'
                    ? 'MoMo'
                    : provider,
            })
          : translate(
              providers === null && !providerError
                ? 'customer:checkoutPage_dangTaiCongThanhToan'
                : 'customer:checkoutPage_chuaCoCongThanhToan',
            );

  const busy = processing || cancelling || creatingOrder || retryingPayment;

  return (
    <section
      className="buyer-page purchase-page page-width purchase-checkout"
      aria-labelledby="checkout-title"
    >
      <header className="purchase-header">
        <div>
          <PurchaseProgress current="checkout" />
          <h1 id="checkout-title">{translate('customer:checkoutPage_thanhToan')}</h1>
        </div>
        {createdOrder && !paymentFailed && (
          <HoldTimer
            expiresAt={createdOrder.expiresAt}
            label={translate('customer:checkoutPage_thoiGianThanhToan')}
            // The page announces expiry with its own alert and next action.
            expiredMessage=""
          />
        )}
      </header>

      {paymentFailed && createdOrder && (
        <PaymentFailedBanner provider={lockedProvider ?? provider}>
          <div className="purchase-status-actions">
            <button
              className="button button-primary"
              type="button"
              disabled={busy || paymentCountdown.isExpired}
              onClick={() => void tryAnotherMethod()}
            >
              {translate(
                retryingPayment ? 'customer:checkout2_retrying' : 'customer:checkout2_tryAnother',
              )}
            </button>
            <button
              className="button button-secondary"
              type="button"
              disabled={busy}
              onClick={() => setCancelDialog('restart')}
            >
              {translate('customer:checkout2_cancelOrder')}
            </button>
            <button
              className="button button-secondary"
              type="button"
              disabled={busy}
              onClick={() => setResumeRefreshKey((value) => value + 1)}
            >
              {translate('customer:orderOutcome_checkStatus')}
            </button>
            <Link className="button button-secondary" to="/profile?tab=orders">
              {translate('customer:orderOutcome_viewOrderHistory')}
            </Link>
          </div>
        </PaymentFailedBanner>
      )}
      {paymentCountdown.isExpired && (
        <div className="purchase-panel purchase-checkout-notice">
          <p role="alert">{translate('customer:checkoutPage_thoiGianThanhToanDaHetVui')}</p>
          <Link className="button button-secondary" to="/profile?tab=orders">
            {translate('customer:orderOutcome_viewOrderHistory')}
          </Link>
        </div>
      )}
      {error && (
        <div className="purchase-panel purchase-checkout-notice">
          <p role="alert">{error}</p>
          {creationNeedsRecovery && (
            <div className="purchase-status-actions">
              <button
                className="button button-secondary"
                type="button"
                disabled={creatingOrder}
                onClick={() => setCreationRetry((value) => value + 1)}
              >
                {translate('customer:checkoutPage_kiemTraLaiDon')}
              </button>
              <Link className="button button-secondary" to="/profile?tab=orders">
                {translate('customer:orderOutcome_viewOrderHistory')}
              </Link>
            </div>
          )}
        </div>
      )}

      <form className="purchase-columns" onSubmit={submitPayment}>
        <div className="purchase-checkout-main">
          <ContactSection titleId={contactTitleId} />
          <section
            className="purchase-panel purchase-payment-method"
            aria-labelledby={methodTitleId}
          >
            <h2 id={methodTitleId}>{translate('customer:checkoutPage_phuongThucThanhToan')}</h2>
            {creatingOrder && (
              <p role="status">{translate('customer:checkoutPage_donHangCuaBanVanDangDuoc')}</p>
            )}
            {providers === null && !providerError && (
              <p role="status">{translate('customer:checkoutPage_dangTaiCongThanhToan')}</p>
            )}
            {providerIssue && (
              <div className="purchase-provider-error">
                <p role="alert">{providerIssue}</p>
                <button
                  className="button button-secondary"
                  type="button"
                  disabled={paymentCountdown.isExpired}
                  onClick={() => setProviderReload((value) => value + 1)}
                >
                  {translate('customer:checkoutPage_thuLai')}
                </button>
              </div>
            )}
            {allowed.length > 0 && (
              <PaymentMethodCards
                options={paymentOptions.filter((option) => allowed.includes(option.value))}
                selected={provider}
                locked={lockedProvider}
                disabled={paymentDisabled}
                labelledBy={methodTitleId}
                onSelect={setProvider}
              />
            )}
            <TermsConsent
              accepted={termsAccepted}
              invalid={termsInvalid && !termsAccepted}
              onChange={(value) => {
                setTermsAccepted(value);
                if (value) setTermsInvalid(false);
              }}
            />
            {!paymentCountdown.isExpired && (
              <button
                className="button button-secondary purchase-checkout-back"
                type="button"
                disabled={busy || creationNeedsRecovery}
                onClick={() => (createdOrder ? setCancelDialog('leave') : void leaveCheckout())}
              >
                {translate(
                  createdOrder
                    ? 'customer:checkoutPage_cancelAndReturn'
                    : 'customer:checkoutPage_chiTietSuKien',
                )}
              </button>
            )}
          </section>
        </div>

        <aside
          className="purchase-panel purchase-order-summary"
          aria-labelledby="checkout-summary-title"
        >
          <h2 id="checkout-summary-title">{translate('customer:checkoutPage_orderSummary')}</h2>
          <SummaryEvent
            title={concertTitle(event)}
            poster={poster}
            date={event.date || undefined}
            venue={event.venue || undefined}
          />
          <CheckoutOrderReference code={createdOrder?.referenceCode} />
          <CheckoutOrderLines order={createdOrder} selection={selection} />
          <div className="purchase-action-bar">
            <div className="purchase-order-total">
              <span>
                {translate(
                  createdOrder
                    ? 'customer:checkoutPage_orderTotal'
                    : 'customer:checkoutPage_tongTamTinh',
                )}
              </span>
              <strong>{formatPrice(displayedTotal)}</strong>
            </div>
            <AllInPriceNote />
            <button className="button button-primary" type="submit" disabled={paymentDisabled}>
              {actionLabel}
            </button>
          </div>
          <BuyerInformationLinks />
        </aside>
      </form>

      {cancelDialog && (
        <AdminConfirmDialog
          title={translate('customer:checkout2_cancelDialogTitle')}
          description={translate('customer:checkout2_cancelDialogBody')}
          confirmLabel={translate('customer:checkout2_cancelOrder')}
          cancelLabel={translate('customer:checkout2_keepOrder')}
          onClose={() => setCancelDialog(null)}
          onConfirm={() => {
            const mode = cancelDialog;
            setCancelDialog(null);
            void (mode === 'restart' ? restartAfterFailedPayment() : leaveCheckout());
          }}
        />
      )}
    </section>
  );
}
