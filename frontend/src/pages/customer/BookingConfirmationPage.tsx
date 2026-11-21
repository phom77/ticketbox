import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { CircleCheck } from 'lucide-react';
import { Link, useLocation } from 'react-router-dom';
import { getConcert, type ConcertDetail } from '../../api/concerts';
import { getOrder, type Order } from '../../api/orders';
import { currency } from '../../data/formatters';
import { useAuth } from '../../features/auth/AuthContext';
import { concertTitle } from '../../features/concert/concertText';
import { orderWindowExpired, type CheckoutEvent } from '../../features/ticket/checkoutPayment';
import { CheckoutEventTime, CheckoutOrderLines, CheckoutStatusPanel } from './CheckoutDetails';

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
  return <VerifyConfirmation key={user.id + ':' + orderId} orderId={orderId} event={state?.event} />;
}

function VerifyConfirmation({ orderId, event }: { orderId: string; event?: CheckoutEvent }) {
  const { t } = useTranslation();
  const [order, setOrder] = useState<Order | null>();

  useEffect(() => {
    const controller = new AbortController();
    void getOrder(orderId, controller.signal).then((data) => {
      if (!controller.signal.aborted) setOrder(data);
    }).catch(() => {
      if (!controller.signal.aborted) setOrder(null);
    });
    return () => controller.abort();
  }, [orderId]);

  if (order === undefined) {
    return (
      <CheckoutStatusPanel
        announce
        title={t('customer:bookingConfirmationPage_verifying')}
        body={t('customer:bookingConfirmationPage_verifyingDetail')}
      >
        <div className="purchase-status-actions">
          <Link className="button button-secondary" to="/profile?tab=orders">
            {t('customer:bookingConfirmationPage_xemLichSuDonHang')}
          </Link>
        </div>
      </CheckoutStatusPanel>
    );
  }

  if (order?.status !== 'PAID' || order.id !== orderId) return <UnconfirmedOrder expired={order !== null && orderWindowExpired(order)} />;
  return <ConfirmedOrder order={order} event={event} />;
}

function UnconfirmedOrder({ expired }: { expired?: boolean }) {
  const { t } = useTranslation();
  return (
    <CheckoutStatusPanel
      title={t(expired
        ? 'customer:bookingConfirmationPage_donHangDaHetHan'
        : 'customer:bookingConfirmationPage_chuaTheXacNhanDonHang')}
      body={t('customer:bookingConfirmationPage_kiemTraTrangThaiMoiNhatTrong')}
    >
      <div className="purchase-status-actions">
        <Link className="button button-primary" to="/profile?tab=orders">
          {t('customer:bookingConfirmationPage_xemLichSuDonHang')}
        </Link>
      </div>
    </CheckoutStatusPanel>
  );
}

function ConfirmedOrder({ order, event }: { order: Order; event?: CheckoutEvent }) {
  const { t } = useTranslation();
  const [concert, setConcert] = useState<ConcertDetail>();
  const knownEvent = event?.id === order.concertId ? event : undefined;

  useEffect(() => {
    if (knownEvent?.date && knownEvent?.venue) return;
    const controller = new AbortController();
    void getConcert(order.concertId, controller.signal).then((data) => {
      if (!controller.signal.aborted) setConcert(data);
    }).catch(() => {
      // The order summary is available without Catalog enrichment.
    });
    return () => controller.abort();
  }, [knownEvent?.date, knownEvent?.venue, order.concertId]);

  const eventTitle = concert ? concertTitle(concert) : knownEvent ? concertTitle(knownEvent) : order.concertTitle;

  return (
    <section className="buyer-page purchase-page page-width purchase-feedback" aria-labelledby="booking-confirmation-title">
      <header className="purchase-header purchase-confirmed-header">
        <CircleCheck size={32} aria-hidden="true" />
        <div>
          <h1 id="booking-confirmation-title">{t('customer:bookingConfirmationPage_datVeThanhCong')}</h1>
          <p>{t('customer:bookingConfirmationPage_thanhToanDaDuocXacNhanBan')}</p>
        </div>
      </header>

      <section className="purchase-panel purchase-confirmed-summary" aria-labelledby="confirmed-event-title">
        <h2 id="confirmed-event-title">{eventTitle}</h2>
        <CheckoutEventTime date={concert?.eventDate ?? knownEvent?.date} venue={concert?.venueName ?? knownEvent?.venue} />
        <p className="purchase-order-reference">
          <span>{t('customer:bookingConfirmationPage_orderReference')}</span>
          <b title={order.id}>{order.id.slice(0, 8).toUpperCase()}</b>
        </p>
        <CheckoutOrderLines order={order} />
        <div className="purchase-order-total">
          <span>{t('customer:bookingConfirmationPage_paidAmount')}</span>
          <strong>{currency.format(order.totalAmount)}</strong>
        </div>
      </section>

      <div className="purchase-status-actions">
        <Link className="button button-primary" to="/my-tickets">
          {t('customer:bookingConfirmationPage_xemVeCuaToi')}
        </Link>
        <Link className="button button-secondary" to="/profile?tab=orders">
          {t('customer:bookingConfirmationPage_xemLichSuDonHang')}
        </Link>
      </div>
    </section>
  );
}
