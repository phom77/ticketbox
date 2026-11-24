import type { Order } from '../../api/orders';
import { hasPerformanceDetails, loadConcertView, orderView } from '../event/eventView';
import { translate } from '../../i18n';
import type { CheckoutEvent } from '../ticket/checkoutPayment';
import type { CheckoutSelection } from '../ticketSelection/selection';

export function seatDescription(item: {
  sectionLabel?: string | null;
  rowLabel?: string | null;
  seatLabel?: string | null;
}) {
  const seat =
    item.rowLabel && item.seatLabel
      ? translate('performances:seat', { row: item.rowLabel, seat: item.seatLabel })
      : null;
  return [item.sectionLabel, seat].filter(Boolean).join(' · ');
}

export async function checkoutPresentation(
  order: Order,
  signal: AbortSignal,
): Promise<{
  event: CheckoutEvent;
  selection: CheckoutSelection[];
}> {
  const concert = hasPerformanceDetails(order)
    ? null
    : await loadConcertView(order.concertId, signal);
  const event: CheckoutEvent = orderView(order, concert);
  return {
    event,
    selection: order.items.map((item) => ({
      id: order.performanceId ? item.id : item.ticketTypeId,
      name: item.ticketTypeName,
      price: item.unitPrice,
      quantity: item.quantity,
      sectionLabel: item.sectionLabel,
      rowLabel: item.rowLabel,
      seatLabel: item.seatLabel,
    })),
  };
}
