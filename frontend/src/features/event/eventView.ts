import { getConcert, type ConcertSummary, type ConcertTranslations } from '../../api/concerts';
import type { Order } from '../../api/orders';
import { eventPath, performancePath, type Performance } from '../../api/performances';
import type { Ticket } from '../../api/tickets';

/**
 * One buyer-facing shape for the legacy Concert and the Event + Performance model.
 * `id` is what the purchase flow buys: the legacy concert id or the performance id.
 * `eventId` is set only for the Event + Performance model.
 */
export type EventView = {
  id: string;
  eventId?: string | null;
  title: string;
  translations?: ConcertTranslations;
  venue: string;
  date: string;
  timezone?: string | null;
  image: string | null;
};

export function concertView(
  concert: Pick<
    ConcertSummary,
    'id' | 'title' | 'translations' | 'venueName' | 'eventDate' | 'posterUrl'
  >,
): EventView {
  return {
    id: concert.id,
    title: concert.title,
    translations: concert.translations,
    venue: concert.venueName ?? '',
    date: concert.eventDate ?? '',
    image: concert.posterUrl ?? null,
  };
}

export function performanceView(
  event: { id: string; title: string },
  performance: Pick<Performance, 'id' | 'venueName' | 'startsAt' | 'timezone'>,
): EventView {
  return {
    id: performance.id,
    eventId: event.id,
    title: event.title,
    venue: performance.venueName,
    date: performance.startsAt,
    timezone: performance.timezone,
    image: null,
  };
}

/** Orders and tickets for a performance carry their own date and venue. */
export function hasPerformanceDetails(
  record: Pick<Order | Ticket, 'performanceId' | 'performanceStartsAt'>,
) {
  return Boolean(record.performanceId && record.performanceStartsAt);
}

export function orderView(order: Order, concert?: EventView | null): EventView {
  if (hasPerformanceDetails(order)) {
    return {
      id: order.performanceId!,
      eventId: order.eventId,
      title: order.performanceTitle ?? order.concertTitle,
      venue: order.performanceVenueName ?? '',
      date: order.performanceStartsAt!,
      image: null,
    };
  }
  return concert?.id === order.concertId
    ? concert
    : { id: order.concertId, title: order.concertTitle, venue: '', date: '', image: null };
}

export function ticketView(ticket: Ticket, concert?: EventView | null): EventView {
  if (hasPerformanceDetails(ticket)) {
    return {
      id: ticket.performanceId!,
      eventId: ticket.eventId,
      title: ticket.concertTitle,
      venue: ticket.performanceVenueName ?? '',
      date: ticket.performanceStartsAt!,
      image: null,
    };
  }
  return concert?.id === ticket.concertId
    ? concert
    : { id: ticket.concertId, title: ticket.concertTitle, venue: '', date: '', image: null };
}

/** The buyer routes for an event in either catalog model. */
export function purchasePaths(view: Pick<EventView, 'id' | 'eventId'>) {
  const base = view.eventId
    ? performancePath(view.eventId, view.id)
    : '/concerts/' + encodeURIComponent(view.id);
  return {
    details: view.eventId ? eventPath(view.eventId) : base,
    waitingRoom: base + '/waiting-room',
    selection: base + '/seats',
  };
}

const cacheTtlMs = 5 * 60_000;
const concertViews = new Map<string, { at: number; view: Promise<EventView | null> }>();

/**
 * Catalog details for a legacy concert, shared by checkout, confirmation and the
 * ticket wallet. Lookups are deduplicated for a few minutes; a failure is not cached
 * because the order or ticket remains usable without Catalog enrichment.
 */
export async function loadConcertView(id: string, signal?: AbortSignal) {
  const cached = concertViews.get(id);
  let entry = cached && Date.now() - cached.at < cacheTtlMs ? cached : undefined;
  if (!entry) {
    const view = getConcert(id)
      .then(concertView)
      .catch(() => {
        concertViews.delete(id);
        return null;
      });
    entry = { at: Date.now(), view };
    concertViews.set(id, entry);
  }
  const view = await entry.view;
  if (signal?.aborted) throw new DOMException('Aborted', 'AbortError');
  return view;
}

/** Test helper. */
export function clearConcertViewCache() {
  concertViews.clear();
}
