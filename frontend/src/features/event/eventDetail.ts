import type { ConcertStatus, ConcertTranslations } from '../../api/concerts';
import { eventPath, performancePath, type AgeRating } from '../../api/performances';
import { concertSaleState } from '../concert/concertSale';

/** One performance (or the single date of a legacy concert) on the detail page. */
export type DetailDate = {
  /** What the purchase flow buys: the performance id, or the legacy concert id. */
  id: string;
  startsAt: string;
  endsAt: string | null;
  timezone: string | null;
  venueName: string;
  venueAddress: string | null;
  spaceName: string | null;
  doorsOpenAt: string | null;
  saleStartAt: string;
  saleEndAt: string | null;
  status: ConcertStatus;
  salesSuspended: boolean;
  maxPerAccount: number | null;
  /** Set when the purchase flow is the legacy concert flow. */
  legacyConcertId: string | null;
};

export type EventDetailModel = {
  eventId: string | null;
  title: string;
  description: string | null;
  artistBio: string | null;
  segment: string | null;
  primaryGenre: string | null;
  /** Secondary genres, shown as tags. */
  genres: string[];
  posterUrl: string | null;
  organizer: string | null;
  seatMapSvg: string | null;
  dates: DetailDate[];
  /** Per-language title and description of a native event. */
  translations?: ConcertTranslations;
  ageRating?: AgeRating | null;
  refundPolicy?: string | null;
};

export type DateSaleState =
  | 'on-sale'
  | 'waiting-room'
  | 'upcoming'
  | 'sold-out'
  | 'cancelled'
  | 'paused'
  | 'closed';

/** Distinguishes sold out, cancelled and paused sales instead of one "closed" state. */
export function dateSaleState(
  date: Pick<
    DetailDate,
    'status' | 'salesSuspended' | 'saleStartAt' | 'saleEndAt' | 'legacyConcertId'
  >,
  now: number,
  soldOut = false,
): DateSaleState {
  const state = concertSaleState(date, now);
  if (state === 'cancelled' || state === 'closed') return state;
  if (date.salesSuspended) return 'paused';
  if (state === 'sold-out') return state;
  if (state === 'on-sale' || state === 'waiting-room') {
    if (soldOut) return 'sold-out';
    // Only the legacy flow opens its waiting room before the sale starts.
    if (state === 'waiting-room' && !date.legacyConcertId) return 'upcoming';
  }
  return state;
}

export const canPurchase = (state: DateSaleState) =>
  state === 'on-sale' || state === 'waiting-room';

export function datePurchasePath(
  eventId: string | null,
  date: Pick<DetailDate, 'id' | 'legacyConcertId'>,
) {
  if (date.legacyConcertId) return '/concerts/' + encodeURIComponent(date.legacyConcertId);
  return performancePath(eventId ?? date.id, date.id);
}

export const dateDetailPath = (eventId: string | null, date: Pick<DetailDate, 'id'>) =>
  eventPath(eventId ?? date.id) + '?performance=' + encodeURIComponent(date.id);

/** Month buckets in start order, keyed in the event timezone. */
export function groupByMonth(dates: DetailDate[], locale: string) {
  const groups: Array<{ key: string; label: string; dates: DetailDate[] }> = [];
  for (const date of [...dates].sort((a, b) => Date.parse(a.startsAt) - Date.parse(b.startsAt))) {
    const zone = date.timezone ?? undefined;
    const parts = new Intl.DateTimeFormat('en-CA', {
      year: 'numeric',
      month: '2-digit',
      timeZone: zone,
    }).format(new Date(date.startsAt));
    const last = groups[groups.length - 1];
    if (last?.key === parts) last.dates.push(date);
    else
      groups.push({
        key: parts,
        label: new Intl.DateTimeFormat(locale, {
          month: 'long',
          year: 'numeric',
          timeZone: zone,
        }).format(new Date(date.startsAt)),
        dates: [date],
      });
  }
  return groups;
}

export const defaultQuantityLimit = 6;

export function quantityLimit(maxPerAccount: number | null | undefined) {
  return maxPerAccount && maxPerAccount > 0 ? Math.floor(maxPerAccount) : defaultQuantityLimit;
}

/** A valid quantity from the `qty` URL parameter. */
export function clampQuantity(raw: string | number | null | undefined, limit: number) {
  const value = Number(raw);
  if (!Number.isFinite(value)) return 1;
  return Math.min(Math.max(1, Math.floor(value)), Math.max(1, limit));
}

export function mapsUrl(venueName: string, address: string | null) {
  return (
    'https://www.google.com/maps/search/?api=1&query=' +
    encodeURIComponent([venueName, address].filter(Boolean).join(', '))
  );
}
