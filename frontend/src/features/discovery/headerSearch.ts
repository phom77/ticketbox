import type { ConcertSummary } from '../../api/concerts';
import { eventPath } from '../../api/performances';
import { concertTitle } from '../concert/concertText';
import { dateOptions } from './filters';

/** Header search values; they map onto the existing discovery URL parameters. */
export type HeaderSearchValues = {
  where: string;
  what: string;
  date: keyof typeof dateOptions;
  from: string;
  to: string;
};

export type SuggestionItem = ConcertSummary & { eventId?: string | null };

export type EventSuggestion = {
  id: string;
  title: string;
  venue: string;
  date: string;
  href: string;
};
export type SearchSuggestions = { events: EventSuggestion[]; venues: string[] };

export type RecentSearch = { where: string; what: string };

const maxSuggestions = 5;
const maxRecent = 5;
const recentKey = 'ticketbox.recent-searches';
const splitKey = 'ticketbox.search-split';

export function normaliseSearch(value: string) {
  return value
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .toLowerCase()
    .replace(/đ/g, 'd')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Catalog matches every word of `q` against the event title, translated titles and venue,
 * so the place joins the keyword in one query.
 */
export function combineQuery(what: string, where: string) {
  return [what, where]
    .map((part) => part.trim().replace(/\s+/g, ' '))
    .filter(Boolean)
    .join(' ');
}

function readStorage(storage: () => Storage, key: string) {
  try {
    return storage().getItem(key);
  } catch {
    return null;
  }
}

function writeStorage(storage: () => Storage, key: string, value: string | null) {
  try {
    if (value === null) storage().removeItem(key);
    else storage().setItem(key, value);
  } catch {
    // Search still works without remembering it on this device.
  }
}

/** Remembers how the buyer split the last query so the header can show it again. */
export function rememberSearchSplit(values: RecentSearch) {
  writeStorage(() => sessionStorage, splitKey, JSON.stringify(values));
}

/** Restores Where/What only while `q` still equals the remembered combination. */
export function splitQuery(q: string): RecentSearch {
  try {
    const saved = JSON.parse(
      readStorage(() => sessionStorage, splitKey) ?? 'null',
    ) as RecentSearch | null;
    if (saved && typeof saved.what === 'string' && typeof saved.where === 'string') {
      if (combineQuery(saved.what, saved.where) === q.trim()) return saved;
    }
  } catch {
    // Fall through to the whole query.
  }
  return { where: '', what: q };
}

export function readRecentSearches(): RecentSearch[] {
  try {
    const saved = JSON.parse(readStorage(() => localStorage, recentKey) ?? '[]');
    return Array.isArray(saved)
      ? saved
          .filter(
            (entry): entry is RecentSearch =>
              typeof entry?.what === 'string' &&
              typeof entry?.where === 'string' &&
              Boolean(combineQuery(entry.what, entry.where)),
          )
          .slice(0, maxRecent)
      : [];
  } catch {
    return [];
  }
}

export function addRecentSearch(search: RecentSearch) {
  const entry = { what: search.what.trim(), where: search.where.trim() };
  const query = normaliseSearch(combineQuery(entry.what, entry.where));
  if (!query) return readRecentSearches();
  const next = [
    entry,
    ...readRecentSearches().filter(
      (saved) => normaliseSearch(combineQuery(saved.what, saved.where)) !== query,
    ),
  ].slice(0, maxRecent);
  writeStorage(() => localStorage, recentKey, JSON.stringify(next));
  return next;
}

export function clearRecentSearches() {
  writeStorage(() => localStorage, recentKey, null);
}

export function recentSearchLabel(search: RecentSearch) {
  return [search.what.trim(), search.where.trim()].filter(Boolean).join(' · ');
}

/** Groups discovery results into event and venue suggestions for the typed query. */
export function buildSuggestions(items: SuggestionItem[], query: string): SearchSuggestions {
  const words = normaliseSearch(query).split(' ').filter(Boolean);
  const events: EventSuggestion[] = [];
  const shownEvents = new Set<string>();
  const venues = new Map<string, string>();

  for (const item of items) {
    const key = item.eventId ?? item.id;
    if (!shownEvents.has(key) && events.length < maxSuggestions) {
      shownEvents.add(key);
      events.push({
        id: key,
        title: concertTitle(item),
        venue: item.venueName,
        date: item.eventDate,
        href: item.eventId
          ? `${eventPath(item.eventId)}?performance=${encodeURIComponent(item.id)}`
          : `/concerts/${encodeURIComponent(item.id)}`,
      });
    }
    const venue = item.venueName?.trim();
    if (!venue) continue;
    const name = normaliseSearch(venue);
    if (!venues.has(name) && words.length && words.every((word) => name.includes(word)))
      venues.set(name, venue);
  }

  return { events, venues: [...venues.values()].slice(0, maxSuggestions) };
}

/** The known city the buyer typed (ignoring case and Vietnamese marks), if any. */
export function matchCity(value: string, cities: readonly string[]) {
  // "Hà Nội", "ha noi" and "Hanoi" all name the same city.
  const compact = (text: string) => normaliseSearch(text).replace(/\s/g, '');
  const wanted = compact(value);
  if (!wanted) return null;
  return cities.find((city) => compact(city) === wanted) ?? null;
}
