import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { CircleCheck } from 'lucide-react';
import { Link, useLocation } from 'react-router-dom';
import { getOrder, type Order } from '../../api/orders';
import { PurchaseProgress } from '../../components/purchase/PurchaseProgress';
import { useAuth } from '../../features/auth/AuthContext';
import { concertTitle } from '../../features/concert/concertText';
import {
  hasPerformanceDetails,
  loadConcertView,
  orderView,
  type EventView,
} from '../../features/event/eventView';
import { AllInPriceNote } from '../../features/price/AllInPrice';
import { formatPrice } from '../../features/price/price';
import type { CheckoutEvent } from '../../features/ticket/checkoutPayment';
import { resolveOrderOutcome } from '../../features/ticket/orderOutcome';
import {
  CheckoutEventTime,
  CheckoutOrderLines,
  CheckoutOrderReference,
  CheckoutStatusPanel,
} from './CheckoutDetails';

type ConfirmationState = {
  event?: CheckoutEvent;
  orderId?: string;
  order?: Pick<Order, 'id'>;
};

export function BookingConfirmationPage() {
  const { user } = useAuth();
  const state = useLocation().state as ConfirmationState | null;
  // A previous version kept the order snapshot in browser history. Its ID remains a lookup hint.
  const orderId = state?.orderId ?? state?.order?.id;
  if (!user || typeof orderId !== 'string' || !orderId) return <UnconfirmedOrder />;
  return (
    <VerifyConfirmation key={user.id + ':' + orderId} orderId={orderId} event={state?.event} />
  );
}

function VerifyConfirmation({ orderId, event }: { orderId: string; event?: CheckoutEvent }) {
  const { t } = useTranslation();
  const [order, setOrder] = useState<Order | null>();

  useEffect(() => {
    const controller = new AbortController();
    void getOrder(orderId, controller.signal)
      .then((data) => {
        if (!controller.signal.aborted) setOrder(data);
      })
      .catch(() => {
        if (!controller.signal.aborted) setOrder(null);
      });
    return () => controller.abort();
  }, [orderId]);

  if (order === undefined) {
    return (
      <CheckoutStatusPanel
        announce
        step="done"
        title={t('customer:orderOutcome_verifyingOrderTitle')}
        body={t('customer:orderOutcome_verifyingOrderBody')}
      >
        <div className="purchase-status-actions">
          <Link className="button button-secondary" to="/profile?tab=orders">
            {t('customer:orderOutcome_viewOrderHistory')}
          </Link>
        </div>
      </CheckoutStatusPanel>
    );
  }

  // The confirmation reads no payment status: an unpaid order is unconfirmed here.
  const outcome = order?.id === orderId ? resolveOrderOutcome(order, null).kind : null;
  if (!order || outcome !== 'paid')
    return <UnconfirmedOrder expired={outcome === 'expired' || outcome === 'expiredPending'} />;
  return <ConfirmedOrder order={order} event={event} />;
}

function UnconfirmedOrder({ expired }: { expired?: boolean }) {
  const { t } = useTranslation();
  return (
    <CheckoutStatusPanel
      step="done"
      title={t(
        expired ? 'customer:orderOutcome_expiredTitle' : 'customer:orderOutcome_unconfirmedTitle',
      )}
      body={t('customer:orderOutcome_checkHistoryBody')}
    >
      <div className="purchase-status-actions">
        <Link className="button button-primary" to="/profile?tab=orders">
          {t('customer:orderOutcome_viewOrderHistory')}
        </Link>
      </div>
    </CheckoutStatusPanel>
  );
}

function ConfirmedOrder({ order, event }: { order: Order; event?: CheckoutEvent }) {
  const { t } = useTranslation();
  const [concert, setConcert] = useState<EventView | null>(null);
  const knownEvent = event?.id === order.concertId ? event : undefined;
  const needsCatalog = !hasPerformanceDetails(order) && !(knownEvent?.date && knownEvent?.venue);

  useEffect(() => {
    if (!needsCatalog) return;
    const controller = new AbortController();
    void loadConcertView(order.concertId, controller.signal)
      .then((view) => {
        if (!controller.signal.aborted) setConcert(view);
      })
      .catch(() => {
        // The order summary is available without Catalog enrichment.
      });
    return () => controller.abort();
  }, [needsCatalog, order.concertId]);

  const view = orderView(order, concert ?? knownEvent);
  const eventTitle = concertTitle(view);

  return (
    <section
      className="buyer-page purchase-page page-width purchase-feedback"
      aria-labelledby="booking-confirmation-title"
    >
      <PurchaseProgress current="done" />
      <header className="purchase-header purchase-confirmed-header">
        <CircleCheck size={32} aria-hidden="true" />
        <div>
          <h1 id="booking-confirmation-title">
            {t('customer:bookingConfirmationPage_datVeThanhCong')}
          </h1>
          <p>{t('customer:bookingConfirmationPage_thanhToanDaDuocXacNhanBan')}</p>
        </div>
      </header>

      <section
        className="purchase-panel purchase-confirmed-summary"
        aria-labelledby="confirmed-event-title"
      >
        <h2 id="confirmed-event-title">{eventTitle}</h2>
        <CheckoutEventTime date={view.date || undefined} venue={view.venue || undefined} />
        <CheckoutOrderReference code={order.referenceCode} />
        <CheckoutOrderLines order={order} />
        <div className="purchase-order-total">
          <span>{t('customer:bookingConfirmationPage_paidAmount')}</span>
          <strong>{formatPrice(order.totalAmount)}</strong>
        </div>
        <AllInPriceNote />
      </section>

      <div className="purchase-status-actions">
        <Link className="button button-primary" to="/my-tickets">
          {t('customer:bookingConfirmationPage_xemVeCuaToi')}
        </Link>
        <Link className="button button-secondary" to="/profile?tab=orders">
          {t('customer:orderOutcome_viewOrderHistory')}
        </Link>
      </div>
    </section>
  );
}
