import { eventPath } from '../../api/performances';
import type { EventCardItem } from '../../components/EventCard';
import { concertTitle } from '../concert/concertText';
import { daysFromToday, discoverySaleState, type DiscoveryConcert } from './filters';

export function discoveryHref(concert: DiscoveryConcert) {
  return concert.performance
    ? `${eventPath(concert.performance.eventId)}?performance=${encodeURIComponent(concert.id)}`
    : `/concerts/${encodeURIComponent(concert.id)}`;
}

export function eventCard(
  concert: DiscoveryConcert,
  now: number,
  withDayBadge = false,
): EventCardItem & { href: string } {
  const status = discoverySaleState(concert, now);
  const date = Date.parse(concert.eventDate);
  const day = withDayBadge && Number.isFinite(date) ? daysFromToday(date, now) : -1;
  return {
    id: concert.id,
    title: concertTitle(concert),
    venue: concert.venueName,
    city: concert.city,
    href: discoveryHref(concert),
    eventDate: concert.eventDate,
    image: concert.posterUrl,
    status,
    minPrice: concert.minPrice,
    performanceCount: concert.performanceCount,
    dayBadge: day === 0 ? 'today' : day === 1 ? 'tomorrow' : null,
  };
}

export type HomeRows = {
  highlights: DiscoveryConcert[];
  thisWeek: DiscoveryConcert[];
  onSale: DiscoveryConcert[];
  comingSoon: DiscoveryConcert[];
};

/** Splits the upcoming events into the home page groups; no extra Catalog field is needed. */
export function homeRows(concerts: DiscoveryConcert[], now: number): HomeRows {
  const state = (concert: DiscoveryConcert) => discoverySaleState(concert, now);
  const onSale = concerts.filter((concert) => state(concert) === 'on-sale');
  const highlights = onSale.filter((concert) => concert.posterUrl).slice(0, 5);
  const thisWeek = concerts.filter((concert) => {
    const date = Date.parse(concert.eventDate);
    if (!Number.isFinite(date) || ['closed', 'cancelled'].includes(state(concert))) return false;
    const days = daysFromToday(date, now);
    return days >= 0 && days < 7;
  });
  return {
    highlights,
    thisWeek,
    onSale,
    comingSoon: concerts.filter((concert) => state(concert) === 'upcoming'),
  };
}
