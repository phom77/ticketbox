import { getConcert } from '../../api/concerts';
import type { Order } from '../../api/orders';
import { translate } from '../../i18n';
import type { CheckoutEvent } from '../ticket/checkoutPayment';
import type { CheckoutSelection } from '../../pages/customer/SeatSelectionPage';

export function seatDescription(item: { sectionLabel?: string | null; rowLabel?: string | null; seatLabel?: string | null }) {
  const seat = item.rowLabel && item.seatLabel
    ? translate('performances:seat', { row: item.rowLabel, seat: item.seatLabel }) : null;
  return [item.sectionLabel, seat].filter(Boolean).join(' · ');
}

export async function checkoutPresentation(order: Order, signal: AbortSignal): Promise<{
  event: CheckoutEvent;
  selection: CheckoutSelection[];
}> {
  let event: CheckoutEvent;
  if (order.performanceId && order.performanceStartsAt) {
    event = {
      id: order.performanceId, eventId: order.eventId, title: order.performanceTitle ?? order.concertTitle,
      venue: order.performanceVenueName ?? '', date: order.performanceStartsAt, image: null,
    };
  } else {
    const concert = await getConcert(order.concertId, signal).catch(() => null);
    event = {
      id: order.concertId, title: concert?.title ?? order.concertTitle, translations: concert?.translations,
      venue: concert?.venueName ?? '', date: concert?.eventDate ?? '', image: concert?.posterUrl ?? null,
    };
  }
  return {
    event,
    selection: order.items.map((item) => ({
      id: order.performanceId ? item.id : item.ticketTypeId,
      name: item.ticketTypeName, price: item.unitPrice, quantity: item.quantity,
      sectionLabel: item.sectionLabel, rowLabel: item.rowLabel, seatLabel: item.seatLabel,
    })),
  };
}
