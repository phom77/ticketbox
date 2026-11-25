import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useParams } from 'react-router-dom';
import { ArrowLeft, Printer } from 'lucide-react';
import { ApiClientError, isRequestCanceled } from '../../api/client';
import { getOrder, getPaymentStatus, type Order, type PaymentProvider } from '../../api/orders';
import { BuyerState } from '../../components/feedback/BuyerState';
import { DetailSkeleton } from '../../components/feedback/Skeleton';
import { currency, dateFormatter } from '../../data/formatters';
import { useAuth } from '../../features/auth/AuthContext';
import {
  buildOrderTimeline,
  displayedOrderStatus,
  orderDeadline,
  orderStatusKeys,
  seatSummary,
} from '../../features/account/orders';
import { orderView } from '../../features/event/eventView';
import { seatDescription } from '../../features/performance/checkoutPresentation';
import './OrderDetailPage.css';

const dateTime = dateFormatter({ dateStyle: 'medium', timeStyle: 'short' });
const providerLabels: Record<PaymentProvider, string> = {
  MOCK: 'customer:account_providerMock',
  MOMO: 'customer:account_providerMomo',
  VNPAY: 'customer:account_providerVnpay',
};
const timelineKeys = {
  created: 'customer:account_timelineCreated',
  awaitingPayment: 'customer:account_timelineAwaiting',
  paid: 'customer:account_timelinePaid',
  ticketsIssued: 'customer:account_timelineTickets',
  expired: 'customer:account_timelineExpired',
  cancelled: 'customer:account_timelineCancelled',
  paymentFailed: 'customer:account_timelineFailed',
  refunded: 'customer:account_timelineRefunded',
} as const;

export function OrderDetailPage() {
  const { user } = useAuth();
  const { orderId = '' } = useParams();
  return user ? <OrderDetail key={user.id + ':' + orderId} orderId={orderId} /> : null;
}

function OrderDetail({ orderId }: { orderId: string }) {
  const { t } = useTranslation();
  const [order, setOrder] = useState<Order | null>(null);
  const [provider, setProvider] = useState<PaymentProvider | null>(null);
  const [failure, setFailure] = useState<'notFound' | 'error' | null>(null);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    const { signal } = controller;
    getOrder(orderId, signal)
      .then((loaded) => {
        if (signal.aborted) return;
        setOrder(loaded);
        if (loaded.status !== 'AWAITING_PAYMENT') {
          getPaymentStatus(orderId, signal)
            .then((status) => !signal.aborted && setProvider(status.provider))
            .catch(() => undefined);
        }
      })
      .catch((error) => {
        if (signal.aborted || isRequestCanceled(error)) return;
        const status = error instanceof ApiClientError ? error.status : 0;
        setFailure(status === 404 || status === 403 ? 'notFound' : 'error');
      });
    return () => controller.abort();
  }, [orderId, attempt]);

  const back = (
    <Link className="ticket-detail-back order-detail-noprint" to="/account/orders">
      <ArrowLeft size={18} aria-hidden="true" />
      {t('customer:account_backToOrders')}
    </Link>
  );

  if (failure) {
    return (
      <div className="buyer-page page-width order-detail">
        {back}
        <BuyerState
          tone={failure === 'error' ? 'error' : 'empty'}
          title={t(
            failure === 'error'
              ? 'customer:account_orderErrorTitle'
              : 'customer:account_orderNotFoundTitle',
          )}
          actions={
            failure === 'error' ? (
              <button
                className="button button-secondary"
                type="button"
                onClick={() => {
                  setFailure(null);
                  setAttempt((value) => value + 1);
                }}
              >
                {t('customer:profilePage_thuLai')}
              </button>
            ) : (
              <Link className="button button-primary" to="/account/orders">
                {t('customer:account_backToOrders')}
              </Link>
            )
          }
        >
          {t(
            failure === 'error'
              ? 'customer:account_orderErrorBody'
              : 'customer:account_orderNotFoundBody',
          )}
        </BuyerState>
      </div>
    );
  }

  if (!order) {
    return (
      <div className="buyer-page page-width order-detail">
        {back}
        <DetailSkeleton rows={4} label={t('customer:account_orderLoading')} />
      </div>
    );
  }

  const status = displayedOrderStatus(order, Date.now());
  const view = orderView(order);
  const startsAt = Date.parse(view.date);
  const timeline = buildOrderTimeline(order, status);
  const { quantity } = seatSummary(order);
  const encoded = encodeURIComponent(order.id);
  const canResume = status === 'AWAITING_PAYMENT' && Number.isFinite(orderDeadline(order));
  const concertParam = order.concertId ? `?concertId=${encodeURIComponent(order.concertId)}` : '';

  return (
    <div className="buyer-page page-width order-detail">
      {back}
      <header className="buyer-page-header">
        <div>
          <h1>{t('customer:account_orderTitle')}</h1>
          {order.referenceCode ? (
            <p className="order-detail-ref">
              {t('customer:profilePage_order')} {order.referenceCode}
            </p>
          ) : null}
        </div>
        <span className={`buyer-order-status status-${status.toLowerCase()}`}>
          {t(orderStatusKeys[status])}
        </span>
      </header>

      <div className="order-detail-layout">
        <div className="order-detail-main">
          <section
            className="buyer-account-panel order-receipt"
            aria-labelledby="order-receipt-title"
          >
            <h2 id="order-receipt-title">{view.title}</h2>
            <dl className="buyer-account-facts">
              {Number.isFinite(startsAt) ? (
                <div>
                  <dt>{t('customer:account_eventDate')}</dt>
                  <dd>
                    <time dateTime={view.date}>{dateTime.format(startsAt)}</time>
                  </dd>
                </div>
              ) : null}
              {view.venue ? (
                <div>
                  <dt>{t('customer:account_venue')}</dt>
                  <dd>{view.venue}</dd>
                </div>
              ) : null}
              <div>
                <dt>{t('customer:profilePage_orderDate')}</dt>
                <dd>
                  <time dateTime={order.createdAt}>
                    {dateTime.format(new Date(order.createdAt))}
                  </time>
                </dd>
              </div>
              {provider ? (
                <div>
                  <dt>{t('customer:account_paymentMethod')}</dt>
                  <dd>{t(providerLabels[provider])}</dd>
                </div>
              ) : null}
            </dl>

            <h3>{t('customer:account_items', { count: quantity })}</h3>
            <ul className="buyer-order-items">
              {order.items.map((item) => (
                <li key={item.id ?? item.ticketTypeId}>
                  <span>
                    {item.ticketTypeName} × {item.quantity}
                    {seatDescription(item) ? (
                      <small className="order-detail-seat">{seatDescription(item)}</small>
                    ) : null}
                  </span>
                  <span>{currency.format(item.subtotal ?? item.unitPrice * item.quantity)}</span>
                </li>
              ))}
            </ul>
            <div className="buyer-order-total order-detail-total">
              <span>{t('customer:profilePage_orderTotal')}</span>
              <strong>{currency.format(order.totalAmount)}</strong>
            </div>
            <p className="order-detail-fees">{t('shared:price_feesIncluded')}</p>
          </section>

          <div className="buyer-account-actions order-detail-noprint">
            {canResume ? (
              <Link className="button button-primary" to={`/checkout?orderId=${encoded}`}>
                {t('customer:profilePage_tiepTucThanhToan')}
              </Link>
            ) : null}
            {status === 'PAID' ? (
              <Link className="button button-primary" to={`/my-tickets${concertParam}`}>
                {t('customer:myTicketsPage_myTickets')}
              </Link>
            ) : null}
            {!canResume && (status === 'AWAITING_PAYMENT' || status === 'EXPIRED') ? (
              <Link className="button button-secondary" to={`/payment/result?orderId=${encoded}`}>
                {t('customer:profilePage_checkPayment')}
              </Link>
            ) : null}
            {status === 'PAID' || status === 'REFUNDED' ? (
              <button
                className="button button-secondary"
                type="button"
                onClick={() => window.print()}
              >
                <Printer size={18} aria-hidden="true" />
                {t('customer:account_printReceipt')}
              </button>
            ) : null}
          </div>
        </div>

        <section
          className="buyer-account-panel order-detail-noprint"
          aria-labelledby="order-timeline-title"
        >
          <h2 id="order-timeline-title">{t('customer:account_timeline')}</h2>
          <ol className="order-timeline">
            {timeline.map((step) => (
              <li key={step.key} data-state={step.state}>
                <strong>{t(timelineKeys[step.key])}</strong>
                {step.at ? (
                  <time dateTime={step.at}>{dateTime.format(new Date(step.at))}</time>
                ) : null}
              </li>
            ))}
          </ol>
        </section>
      </div>
    </div>
  );
}
