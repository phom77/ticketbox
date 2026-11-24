import type { ConcertSummary } from '../../api/concerts';
import { concertSaleState } from '../concert/concertSale';

export const dateOptions = {
  '': 'discovery_anyDate',
  today: 'discovery_today',
  weekend: 'discovery_weekend',
  'next-30': 'discovery_next30Days',
  custom: 'discovery_customDates',
} as const;

export const statusOptions = {
  '': 'discovery_anyStatus',
  'on-sale': 'discovery_onSale',
  upcoming: 'discovery_comingSoon',
  'sold-out': 'discovery_soldOut',
  closed: 'discovery_salesEnded',
} as const;

export const sortOptions = {
  '': 'discovery_eventDate',
  'sale-start': 'discovery_saleStart',
} as const;

export const priceOptions = {
  '': 'discovery_anyPrice',
  'under-500000': 'discovery_under500',
  '500000-1000000': 'discovery_500To1000',
  '1000000-plus': 'discovery_1000Plus',
} as const;

const priceRanges: Record<string, { minPrice?: number; maxPrice?: number }> = {
  'under-500000': { maxPrice: 499_999 },
  '500000-1000000': { minPrice: 500_000, maxPrice: 1_000_000 },
  '1000000-plus': { minPrice: 1_000_001 },
};

export const discoveryOptions = {
  date: dateOptions,
  status: statusOptions,
  sort: sortOptions,
  price: priceOptions,
} as const;

type FilterOption = keyof typeof discoveryOptions;
export type DiscoveryFilters = {
  q: string;
  from: string;
  to: string;
  city: string;
  category: string;
} & {
  [K in FilterOption]: keyof (typeof discoveryOptions)[K];
};

export type DiscoveryConcert = ConcertSummary & {
  performance?: { eventId: string; salesSuspended: boolean };
  minPrice?: number | null;
  city?: string | null;
  category?: string | null;
  performanceCount?: number;
};

export function discoverySaleState(concert: DiscoveryConcert, now: number) {
  const state = concertSaleState(concert, now);
  if (!concert.performance || state === 'cancelled') return state;
  if (concert.performance.salesSuspended) return 'closed';
  return state === 'waiting-room' ? 'upcoming' : state;
}

const legacyStatus: Record<string, DiscoveryFilters['status']> = {
  ON_SALE: 'on-sale',
  DRAFT: 'upcoming',
  SOLD_OUT: 'sold-out',
  'Đang bán': 'on-sale',
  'Sắp mở bán': 'upcoming',
  'Hết vé': 'sold-out',
};

export const capitalize = (value: string) => value.charAt(0).toUpperCase() + value.slice(1);

export const concertTimeZone = 'Asia/Ho_Chi_Minh';
const localCalendar = new Intl.DateTimeFormat('en-CA', {
  timeZone: concertTimeZone,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
});
const dayMs = 86_400_000;

export function localDay(timestamp: number) {
  const parts = localCalendar.formatToParts(timestamp);
  const value = (type: string) => Number(parts.find((part) => part.type === type)?.value);
  return Date.UTC(value('year'), value('month') - 1, value('day'));
}

/** Calendar-day distance of a timestamp from today in the concert time zone (0 = today, 1 = tomorrow). */
export function daysFromToday(timestamp: number, now: number) {
  return Math.round((localDay(timestamp) - localDay(now)) / dayMs);
}

const isoDay = (day: number) => new Date(day).toISOString().slice(0, 10);

/** First and last calendar day of the current month in the concert time zone. */
export function currentMonthRange(now: number) {
  const today = new Date(localDay(now));
  const first = Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), 1);
  const last = Date.UTC(today.getUTCFullYear(), today.getUTCMonth() + 1, 0);
  return { from: isoDay(first), to: isoDay(last) };
}

export function discoveryDateParam(input: string | null) {
  if (!input || !/^\d{4}-\d{2}-\d{2}$/.test(input)) return '';
  const date = new Date(input + 'T00:00:00Z');
  return Number.isFinite(date.getTime()) && date.toISOString().startsWith(input) ? input : '';
}

function option<Values extends Record<string, string>>(
  values: Values,
  input: string | null,
): Extract<keyof Values, string> | '' {
  return input !== null && Object.prototype.hasOwnProperty.call(values, input)
    ? (input as Extract<keyof Values, string>)
    : '';
}

export function readDiscoveryFilters(params: URLSearchParams): DiscoveryFilters {
  const status = params.get('status');
  let date = option(dateOptions, params.get('date'));
  const from = date && date !== 'custom' ? '' : discoveryDateParam(params.get('from'));
  const to = date && date !== 'custom' ? '' : discoveryDateParam(params.get('to'));
  if (!date || date === 'custom') date = from || to ? 'custom' : '';
  return {
    q: params.get('q')?.trim() ?? '',
    date,
    from,
    to,
    status: option(
      statusOptions,
      status && Object.prototype.hasOwnProperty.call(legacyStatus, status)
        ? legacyStatus[status]
        : status,
    ),
    sort: option(sortOptions, params.get('sort')),
    city: params.get('city')?.trim().slice(0, 120) ?? '',
    category: params.get('category')?.trim().slice(0, 120) ?? '',
    price: option(priceOptions, params.get('price')),
  };
}

export function writeDiscoveryFilters(params: URLSearchParams, filters: Partial<DiscoveryFilters>) {
  const next = new URLSearchParams(params);
  for (const [key, value] of Object.entries(filters)) {
    if (value) next.set(key, value);
    else next.delete(key);
  }
  return next;
}

/** Filters that change which events the server returns (everything except the page depth and view mode). */
export const catalogueKeys = [
  'q',
  'date',
  'from',
  'to',
  'status',
  'sort',
  'city',
  'category',
  'price',
] as const;

/** Catalog query string for the filters; price presets become minPrice/maxPrice. */
export function discoverySearch(filters: DiscoveryFilters) {
  const search = new URLSearchParams();
  for (const key of catalogueKeys) {
    if (key === 'price') continue;
    if (filters[key]) search.set(key, filters[key]);
  }
  const range = priceRanges[filters.price];
  if (range?.minPrice !== undefined) search.set('minPrice', String(range.minPrice));
  if (range?.maxPrice !== undefined) search.set('maxPrice', String(range.maxPrice));
  return search.toString();
}

/** Number of pages (1-based depth) the URL asks for. */
export function readPageDepth(params: URLSearchParams) {
  const page = Number(params.get('page'));
  return Number.isInteger(page) && page > 1 ? Math.min(page, 50) : 1;
}
