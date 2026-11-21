import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import type { Order } from '../../api/orders';
import { currency, dateFormatter } from '../../data/formatters';
import type { CheckoutSelection } from './SeatSelectionPage';
import './PurchaseCheckout.css';

type OrderLinesProps = {
  order?: Order | null;
  selection?: CheckoutSelection[];
};

export function CheckoutOrderLines({ order, selection = [] }: OrderLinesProps) {
  const lines = order ? order.items : selection.map((item) => ({
    id: item.id,
    ticketTypeName: item.name,
    quantity: item.quantity,
    unitPrice: item.price,
    subtotal: item.quantity * item.price,
  }));

  return (
    <dl className="purchase-order-lines">
      {lines.map((item) => (
        <div key={item.id}>
          <dt>
            {item.ticketTypeName}
            <span>{item.quantity} × {currency.format(item.unitPrice)}</span>
          </dt>
          <dd>{currency.format(item.subtotal)}</dd>
        </div>
      ))}
    </dl>
  );
}

const eventTime = dateFormatter({ dateStyle: 'medium', timeStyle: 'short' });

export function CheckoutEventTime({ date, venue }: { date?: string; venue?: string }) {
  const timestamp = date ? Date.parse(date) : NaN;
  const start = Number.isFinite(timestamp) ? new Date(timestamp) : null;
  if (!start && !venue) return null;

  return (
    <p className="purchase-event-time">
      {start && <time dateTime={date}>{eventTime.format(start)}</time>}
      {venue && <span>{venue}</span>}
    </p>
  );
}

export function CheckoutStatusPanel({ title, body, orderId, announce, children }: {
  title: string;
  body: string;
  orderId?: string;
  announce?: boolean;
  children?: ReactNode;
}) {
  const { t } = useTranslation();
  return (
    <section className="buyer-page purchase-page page-width purchase-feedback" aria-labelledby="purchase-status-title">
      <div className="purchase-panel purchase-status-panel">
        <div role={announce ? 'status' : undefined}>
          <h1 id="purchase-status-title">{title}</h1>
          <p>{body}</p>
        </div>
        {orderId && (
          <p className="purchase-order-reference">
            <span>{t('customer:checkoutPage_orderReference')}</span> <b>{orderId}</b>
          </p>
        )}
        {children}
      </div>
    </section>
  );
}
