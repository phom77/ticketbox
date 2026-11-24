import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { CircleCheck, MapPin } from 'lucide-react';
import { QRCodeSVG } from 'qrcode.react';
import { Link, Navigate, useLocation, useParams } from 'react-router-dom';
import { getMyOrders, getOrder, type Order } from '../../api/orders';
import { getMyTickets, type Ticket } from '../../api/tickets';
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
import { useOrderPoster } from '../../features/performance/useOrderPoster';
import { confirmationPath, resolveOrderOutcome } from '../../features/ticket/orderOutcome';
import { ticketsForOrder } from '../../features/ticket/orderTickets';
import { seatDescription } from '../../features/performance/checkoutPresentation';
import { SummaryEvent } from './CheckoutParts';
import { CheckoutOrderLines, CheckoutOrderReference, CheckoutStatusPanel } from './CheckoutDetails';

type LegacyConfirmationState = { orderId?: string; order?: Pick<Order, 'id'> };

/** The previous `/booking-confirmation` route: its order id moves to the deep-linkable route. */
export function BookingConfirmationPage() {
  const state = useLocation().state as LegacyConfirmationState | null;
  const orderId = state?.orderId ?? state?.order?.id;
  if (typeof orderId !== 'string' || !orderId) return <UnconfirmedOrder />;
  return <Navigate to={confirmationPath(orderId)} replace />;
}

export function OrderConfirmationPage() {
  const { user } = useAuth();
  const { orderId } = useParams();
  if (!user || !orderId) return <UnconfirmedOrder />;
  return <VerifyConfirmation key={user.id + ':' + orderId} orderId={orderId} />;
}

function VerifyConfirmation({ orderId }: { orderId: string }) {
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
  return <ConfirmedOrder order={order} />;
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

type TicketsState =
  | { status: 'loading' }
  | { status: 'ready'; tickets: Ticket[] }
  | { status: 'pending' }
  | { status: 'ambiguous' }
  | { status: 'error' };

const ticketAttempts = 6;
const ticketIntervalMs = 3_000;

/** Tickets are issued asynchronously after payment, so an empty list is retried briefly. */
function useIssuedTickets(order: Order) {
  const [state, setState] = useState<TicketsState>({ status: 'loading' });
  const [reload, setReload] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    let timer: number | undefined;
    setState({ status: 'loading' });

    async function load(attempt: number) {
      try {
        const [tickets, orders] = await Promise.all([
          getMyTickets(controller.signal),
          getMyOrders(controller.signal),
        ]);
        if (controller.signal.aborted) return;
        const issued = ticketsForOrder(order, tickets, orders);
        if (!issued) {
          setState({ status: 'ambiguous' });
        } else if (issued.length) {
          setState({ status: 'ready', tickets: issued });
        } else if (attempt + 1 >= ticketAttempts) {
          setState({ status: 'pending' });
        } else {
          timer = window.setTimeout(() => void load(attempt + 1), ticketIntervalMs);
        }
      } catch {
        if (!controller.signal.aborted) setState({ status: 'error' });
      }
    }

    void load(0);
    return () => {
      controller.abort();
      window.clearTimeout(timer);
    };
  }, [order, reload]);

  return { state, retry: () => setReload((value) => value + 1) };
}

const maxTicketPreviews = 4;

function TicketPreviews({ order }: { order: Order }) {
  const { t } = useTranslation();
  const { state, retry } = useIssuedTickets(order);

  if (state.status === 'loading')
    return <p role="status">{t('customer:confirm2_ticketsLoading')}</p>;
  if (state.status === 'pending')
    return <p role="status">{t('customer:confirm2_ticketsPending')}</p>;
  if (state.status === 'ambiguous')
    return (
      <p>
        {t('customer:confirm2_ticketsInMyTickets')}{' '}
        <Link to="/my-tickets">{t('customer:bookingConfirmationPage_xemVeCuaToi')}</Link>
      </p>
    );
  if (state.status === 'error')
    return (
      <div>
        <p role="alert">{t('customer:confirm2_ticketsError')}</p>
        <button className="button button-secondary" type="button" onClick={retry}>
          {t('customer:confirm2_ticketsRetry')}
        </button>
      </div>
    );

  const shown = state.tickets.slice(0, maxTicketPreviews);
  const hidden = state.tickets.length - shown.length;
  return (
    <>
      <ul className="purchase-ticket-grid">
        {shown.map((ticket) => {
          const seat = seatDescription(ticket);
          return (
            <li className="purchase-ticket-card" key={ticket.id}>
              <QRCodeSVG
                value={ticket.qrCode}
                size={132}
                level="M"
                marginSize={3}
                bgColor="#fff"
                fgColor="#101828"
                role="img"
                title={t('customer:confirm2_qrFor', { name: ticket.ticketTypeName })}
              />
              <div>
                <strong>{ticket.ticketTypeName}</strong>
                {seat && <span>{seat}</span>}
                {ticket.referenceCode && <span>{ticket.referenceCode}</span>}
              </div>
            </li>
          );
        })}
      </ul>
      {hidden > 0 && (
        <p className="purchase-method-note">
          {t('customer:confirm2_ticketMore', { number: hidden })}
        </p>
      )}
    </>
  );
}

function ConfirmedOrder({ order }: { order: Order }) {
  const { t } = useTranslation();
  const { user } = useAuth();
  const [concert, setConcert] = useState<EventView | null>(null);
  const needsCatalog = !hasPerformanceDetails(order);

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

  const view = orderView(order, concert);
  const eventTitle = concertTitle(view);
  const poster = useOrderPoster(order, view.image);
  const directions = view.venue
    ? 'https://www.google.com/maps/search/?api=1&query=' + encodeURIComponent(view.venue)
    : null;

  return (
    <section
      className="buyer-page purchase-page page-width purchase-feedback purchase-confirmed-page"
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
          {user?.email && (
            <p className="purchase-sent-to">
              {t('customer:confirm2_sentTo', { email: user.email })}
            </p>
          )}
        </div>
      </header>

      <div className="purchase-confirmed-grid">
        <div className="purchase-confirmed-main">
          <section
            className="purchase-panel purchase-confirmed-tickets"
            aria-labelledby="confirmed-tickets-title"
          >
            <h2 id="confirmed-tickets-title">{t('customer:confirm2_ticketsTitle')}</h2>
            <TicketPreviews order={order} />
          </section>
          <section
            className="purchase-panel purchase-confirmed-next"
            aria-labelledby="confirmed-next-title"
          >
            <h2 id="confirmed-next-title">{t('customer:confirm2_whatsNext')}</h2>
            <ul className="purchase-next-list">
              <li>{t('customer:confirm2_next1')}</li>
              <li>{t('customer:confirm2_next2')}</li>
              <li>{t('customer:confirm2_next3')}</li>
            </ul>
            {directions && (
              <div className="purchase-status-actions">
                <a
                  className="button button-secondary"
                  href={directions}
                  target="_blank"
                  rel="noreferrer"
                >
                  <MapPin size={18} aria-hidden="true" />
                  {t('customer:confirm2_directions')}
                </a>
              </div>
            )}
          </section>
        </div>

        <section
          className="purchase-panel purchase-confirmed-summary"
          aria-labelledby="confirmed-event-title"
        >
          <h2 id="confirmed-event-title" className="sr-only">
            {t('customer:checkoutPage_orderSummary')}
          </h2>
          <SummaryEvent
            title={eventTitle}
            poster={poster}
            date={view.date || undefined}
            venue={view.venue || undefined}
          />
          <CheckoutOrderReference code={order.referenceCode} />
          <CheckoutOrderLines order={order} />
          <div className="purchase-order-total">
            <span>{t('customer:bookingConfirmationPage_paidAmount')}</span>
            <strong>{formatPrice(order.totalAmount)}</strong>
          </div>
          <AllInPriceNote />
        </section>
      </div>

      <div className="purchase-status-actions">
        <Link className="button button-primary" to="/my-tickets">
          {t('customer:bookingConfirmationPage_xemVeCuaToi')}
        </Link>
        <Link className="button button-secondary" to="/profile?tab=orders">
          {t('customer:confirm2_orderDetails')}
        </Link>
      </div>
    </section>
  );
}
