import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import type { Order } from '../../api/orders';
import { dateFormatter } from '../../data/formatters';
import { PurchaseProgress, type PurchaseStep } from '../../components/purchase/PurchaseProgress';
import { formatPrice } from '../../features/price/price';
import { seatDescription } from '../../features/performance/checkoutPresentation';
import type { CheckoutSelection } from './SeatSelectionPage';
import './PurchaseCheckout.css';

type OrderLinesProps = {
  order?: Order | null;
  selection?: CheckoutSelection[];
};

export function CheckoutOrderLines({ order, selection = [] }: OrderLinesProps) {
  const lines = order
    ? order.items
    : selection.map((item) => ({
        id: item.id,
        ticketTypeName: item.name,
        quantity: item.quantity,
        unitPrice: item.price,
        subtotal: item.quantity * item.price,
        sectionLabel: item.sectionLabel,
        rowLabel: item.rowLabel,
        seatLabel: item.seatLabel,
      }));

  return (
    <dl className="purchase-order-lines">
      {lines.map((item) => {
        const location = seatDescription(item);
        return (
          <div key={item.id}>
            <dt>
              {item.ticketTypeName}
              {location && <span>{location}</span>}
              <span>
                {item.quantity} × {formatPrice(item.unitPrice)}
              </span>
            </dt>
            <dd>{formatPrice(item.subtotal)}</dd>
          </div>
        );
      })}
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

export function CheckoutOrderReference({ code }: { code?: string | null }) {
  const { t } = useTranslation();
  if (!code) return null;
  return (
    <p className="purchase-order-reference">
      <span>{t('customer:checkoutPage_orderReference')}</span> <b>{code}</b>
    </p>
  );
}

export function CheckoutStatusPanel({
  title,
  body,
  referenceCode,
  announce,
  step,
  children,
}: {
  title: string;
  body: string;
  referenceCode?: string | null;
  announce?: boolean;
  /** The purchase step this status belongs to, shown as progress above the message. */
  step?: PurchaseStep;
  children?: ReactNode;
}) {
  return (
    <section
      className="buyer-page purchase-page page-width purchase-feedback"
      aria-labelledby="purchase-status-title"
    >
      {step ? (
        <div className="purchase-status-progress">
          <PurchaseProgress current={step} />
        </div>
      ) : null}
      <div className="purchase-panel purchase-status-panel">
        <div role={announce ? 'status' : undefined}>
          <h1 id="purchase-status-title">{title}</h1>
          <p>{body}</p>
        </div>
        <CheckoutOrderReference code={referenceCode} />
        {children}
      </div>
    </section>
  );
}
