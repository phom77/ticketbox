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

export const previewCityOptions = {
  '': 'discovery_anyCity',
  hanoi: 'discovery_hanoi',
  hcmc: 'discovery_hcmc',
} as const;

export const previewCategoryOptions = {
  '': 'discovery_anyCategory',
  jazz: 'discovery_jazz',
  pop: 'discovery_pop',
  classical: 'discovery_classical',
} as const;

export const previewPriceOptions = {
  '': 'discovery_anyPrice',
  'under-500000': 'discovery_under500',
  '500000-plus': 'discovery_500Plus',
} as const;

export const discoveryOptions = {
  date: dateOptions,
  status: statusOptions,
  sort: sortOptions,
  city: previewCityOptions,
  category: previewCategoryOptions,
  price: previewPriceOptions,
} as const;

type FilterOption = keyof typeof discoveryOptions;
export type DiscoveryFilters = { q: string; from: string; to: string } & { [K in FilterOption]: keyof typeof discoveryOptions[K] };

export type DiscoveryConcert = ConcertSummary & {
  city?: Exclude<DiscoveryFilters['city'], ''>;
  category?: Exclude<DiscoveryFilters['category'], ''>;
  price?: number;
};

const legacyStatus: Record<string, DiscoveryFilters['status']> = {
  ON_SALE: 'on-sale',
  DRAFT: 'upcoming',
  SOLD_OUT: 'sold-out',
  'Đang bán': 'on-sale',
  'Sắp mở bán': 'upcoming',
  'Hết vé': 'sold-out',
};

export const concertTimeZone = 'Asia/Ho_Chi_Minh';
const localCalendar = new Intl.DateTimeFormat('en-CA', {
  timeZone: concertTimeZone, year: 'numeric', month: '2-digit', day: '2-digit',
});
const dayMs = 86_400_000;

function localDay(timestamp: number) {
  const parts = localCalendar.formatToParts(timestamp);
  const value = (type: string) => Number(parts.find((part) => part.type === type)?.value);
  return Date.UTC(value('year'), value('month') - 1, value('day'));
}

export function discoveryDateParam(input: string | null) {
  if (!input || !/^\d{4}-\d{2}-\d{2}$/.test(input)) return '';
  const date = new Date(input + 'T00:00:00Z');
  return Number.isFinite(date.getTime()) && date.toISOString().startsWith(input) ? input : '';
}

function option<Values extends Record<string, string>>(
  values: Values, input: string | null,
): Extract<keyof Values, string> | '' {
  return input !== null && Object.prototype.hasOwnProperty.call(values, input) ? input as Extract<keyof Values, string> : '';
}

export function readDiscoveryFilters(params: URLSearchParams, preview: boolean): DiscoveryFilters {
  const status = params.get('status');
  let date = option(dateOptions, params.get('date'));
  const from = date && date !== 'custom' ? '' : discoveryDateParam(params.get('from'));
  const to = date && date !== 'custom' ? '' : discoveryDateParam(params.get('to'));
  if (!date || date === 'custom') date = from || to ? 'custom' : '';
  return {
    q: params.get('q')?.trim() ?? '',
    date, from, to,
    status: option(statusOptions, status && Object.prototype.hasOwnProperty.call(legacyStatus, status) ? legacyStatus[status] : status),
    sort: option(sortOptions, params.get('sort')),
    city: preview ? option(previewCityOptions, params.get('city')) : '',
    category: preview ? option(previewCategoryOptions, params.get('category')) : '',
    price: preview ? option(previewPriceOptions, params.get('price')) : '',
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

function searchable(value: string) {
  return value.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase().replace(/đ/g, 'd').replace(/\s+/g, ' ').trim();
}

export function filterConcerts(concerts: DiscoveryConcert[], filters: DiscoveryFilters, now: number) {
  const today = localDay(now);
  const weekday = new Date(today).getUTCDay();
  const saturday = today + ((6 - weekday + 7) % 7) * dayMs;
  const weekendEnd = weekday === 0 ? today + dayMs : saturday + 2 * dayMs;
  const weekendStart = weekday === 0 ? today - dayMs : saturday;
  const from = Date.parse(filters.from + 'T00:00:00Z');
  const to = Date.parse(filters.to + 'T00:00:00Z');
  const queryWords = searchable(filters.q).split(' ').filter(Boolean);

  return concerts.filter((concert) => {
    if (concert.status === 'DRAFT') return false;
    const eventDate = Date.parse(concert.eventDate);
    if (filters.date) {
      if (!Number.isFinite(eventDate)) return false;
      const day = localDay(eventDate);
      if (filters.date === 'custom' && (day < from || day > to)) return false;
      if (filters.date === 'today' && day !== today) return false;
      if (filters.date === 'weekend' && (day < weekendStart || day >= weekendEnd)) return false;
      if (filters.date === 'next-30' && (day < today || day >= today + 30 * dayMs)) return false;
    } else if (!filters.q && !filters.status && eventDate < now) {
      return false;
    }

    if (filters.status) {
      const sale = concertSaleState(concert, now);
      if (filters.status !== (sale === 'waiting-room' ? 'upcoming' : sale)) return false;
    }

    if (filters.city && concert.city !== filters.city) return false;
    if (filters.category && concert.category !== filters.category) return false;
    if (filters.price) {
      if (typeof concert.price !== 'number') return false;
      if (filters.price === 'under-500000' ? concert.price >= 500_000 : concert.price < 500_000) return false;
    }

    if (!queryWords.length) return true;
    const titles = Object.values(concert.translations ?? {}).map((translation) => translation?.title ?? '');
    const searchableText = searchable([concert.title, ...titles, concert.venueName].join(' '));
    return queryWords.every((word) => searchableText.includes(word));
  }).sort((left, right) => {
    const timestamp = (value: string) => Number.isFinite(Date.parse(value)) ? Date.parse(value) : Infinity;
    if (filters.sort === 'sale-start') {
      const difference = timestamp(left.saleStartAt) - timestamp(right.saleStartAt);
      if (difference) return difference;
    }
    return timestamp(left.eventDate) - timestamp(right.eventDate);
  });
}
