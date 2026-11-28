import { ApiClientError } from '../../api/client';
import type { TicketType } from '../../api/concerts';

/** What checkout needs to know about each held ticket line. */
export type CheckoutSelection = Pick<TicketType, 'id' | 'name' | 'price'> & {
  quantity: number;
  sectionLabel?: string | null;
  rowLabel?: string | null;
  seatLabel?: string | null;
};

/** One buyable line in the list, for either catalog model. */
export type OfferRow = {
  key: string;
  sectionId: string | null;
  sectionLabel: string;
  /** Position of the section in the venue layout; lower is closer. Null when unknown. */
  sectionOrder: number | null;
  offerId: string;
  offerName: string;
  price: number;
  available: number;
  kind: 'GA' | 'ASSIGNED' | 'ZONE';
  maxPerAccount: number | null;
  /** Buyer-facing perks set by the organizer. */
  description?: string | null;
  /** Fewest places of this ticket type in one order. Absent means 1. */
  minPerOrder?: number;
};

export type SortOrder = 'price' | 'best';

export type SelectionFilters = {
  quantity: number;
  minPrice: number | null;
  maxPrice: number | null;
  offerName: string;
  sort: SortOrder;
};

export const defaultFilters: SelectionFilters = {
  quantity: 1,
  minPrice: null,
  maxPrice: null,
  offerName: '',
  sort: 'price',
};

/** The `?qty=` set by the event page, kept within 1..max. */
export function parseQuantity(search: string, max = 10) {
  const value = Number.parseInt(new URLSearchParams(search).get('qty') ?? '', 10);
  return Number.isFinite(value) && value >= 1 ? Math.min(value, Math.max(1, max)) : 1;
}

export function priceBounds(rows: OfferRow[]) {
  if (!rows.length) return null;
  const prices = rows.map((row) => row.price);
  return { min: Math.min(...prices), max: Math.max(...prices) };
}

export function offerNames(rows: OfferRow[]) {
  return [...new Set(rows.map((row) => row.offerName))].sort((a, b) =>
    a.localeCompare(b, undefined, { numeric: true }),
  );
}

export function matchesFilters(row: OfferRow, filters: SelectionFilters) {
  if (filters.minPrice != null && row.price < filters.minPrice) return false;
  if (filters.maxPrice != null && row.price > filters.maxPrice) return false;
  if (filters.offerName && row.offerName !== filters.offerName) return false;
  return row.available >= Math.max(1, filters.quantity);
}

export function sortRows(rows: OfferRow[], sort: SortOrder) {
  const label = (a: OfferRow, b: OfferRow) =>
    a.sectionLabel.localeCompare(b.sectionLabel, undefined, { numeric: true });
  return [...rows].sort((a, b) => {
    if (sort === 'best' && a.sectionOrder != null && b.sectionOrder != null) {
      return a.sectionOrder - b.sectionOrder || b.price - a.price || label(a, b);
    }
    return sort === 'best' ? b.price - a.price || label(a, b) : a.price - b.price || label(a, b);
  });
}

/** Filtered and sorted rows; `keep` retains rows the buyer already holds so they can be released. */
export function visibleRows(
  rows: OfferRow[],
  filters: SelectionFilters,
  keep: (row: OfferRow) => boolean = () => false,
) {
  return sortRows(
    rows.filter((row) => keep(row) || matchesFilters(row, filters)),
    filters.sort,
  );
}

export type Stock = 'sold' | 'few' | 'available';
export const fewLeft = 10;

export function stockLevel(available: number): Stock {
  return available <= 0 ? 'sold' : available <= fewLeft ? 'few' : 'available';
}

/** Why a quantity change is not possible, or null when it is. */
export function stepperReason(
  row: Pick<OfferRow, 'available' | 'maxPerAccount' | 'minPerOrder'>,
  quantity: number,
  direction: 'add' | 'remove',
): 'soldOut' | 'limit' | 'minimum' | 'none' | null {
  if (direction === 'remove') return quantity > 0 ? null : 'none';
  if (row.available <= 0) return 'soldOut';
  const minimum = row.minPerOrder ?? 1;
  if (quantity === 0 && row.available < minimum) return 'minimum';
  if (
    row.maxPerAccount != null &&
    Math.max(quantity + 1, quantity === 0 ? minimum : 0) > row.maxPerAccount
  )
    return 'limit';
  return null;
}

/** The quantity after one step: from 0 it jumps to the minimum, and from the minimum it drops back to 0. */
export function nextQuantity(
  row: Pick<OfferRow, 'minPerOrder'>,
  quantity: number,
  direction: 'add' | 'remove',
) {
  const minimum = Math.max(1, row.minPerOrder ?? 1);
  if (direction === 'add') return quantity === 0 ? minimum : quantity + 1;
  return quantity <= minimum ? 0 : quantity - 1;
}

export type HoldProblem = 'quota' | 'soldOut' | 'conflict' | 'rateLimit' | 'minimum' | 'generic';

/** Maps a hold or order failure to a translatable problem, never raw server text. */
export function holdProblem(error: unknown): HoldProblem {
  if (!(error instanceof ApiClientError) || error.status >= 500) return 'generic';
  if (error.status === 429) return 'rateLimit';
  // Limit and sold-out answers are also 409, so read the (localized) message before the status.
  const text = error.message.toLowerCase();
  if (/at least|tối thiểu/.test(text)) return 'minimum';
  if (/quota|limit|per account|maximum|exceed|giới hạn|tối đa/.test(text)) return 'quota';
  if (/sold out|no longer available|already held|taken|bán hết|không còn/.test(text))
    return 'soldOut';
  if (error.status === 409) return 'conflict';
  return 'generic';
}

/** The hold time for display in the performance's own time zone. */
export function heldUntil(expiresAt: string | null, timeZone: string | undefined, locale?: string) {
  if (!expiresAt || Number.isNaN(Date.parse(expiresAt))) return null;
  return new Intl.DateTimeFormat(locale, { timeStyle: 'short', timeZone }).format(
    new Date(expiresAt),
  );
}

/** Pan and zoom, clamped so the map cannot be lost. */
export type View = { scale: number; x: number; y: number };
export const initialView: View = { scale: 1, x: 0, y: 0 };
export const zoomLimits = { min: 1, max: 6 };

export function zoomView(view: View, factor: number, focus = { x: 0, y: 0 }): View {
  const scale = Math.min(zoomLimits.max, Math.max(zoomLimits.min, view.scale * factor));
  if (scale === zoomLimits.min) return initialView;
  const ratio = scale / view.scale;
  return {
    scale,
    x: focus.x - (focus.x - view.x) * ratio,
    y: focus.y - (focus.y - view.y) * ratio,
  };
}

export function clampView(view: View, width: number, height: number): View {
  const minX = width - width * view.scale;
  const minY = height - height * view.scale;
  return {
    scale: view.scale,
    x: Math.min(0, Math.max(minX, view.x)),
    y: Math.min(0, Math.max(minY, view.y)),
  };
}
