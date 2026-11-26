import { api, apiGet } from './client';

/** Money fields are absent unless the caller holds the FINANCE grant. */
export type SalesFigures = {
  ticketsSold: number;
  ticketsRefunded: number;
  netTickets: number;
  orders: number;
  grossSales?: number;
  refunds?: number;
  netSales?: number;
};

export type SalesScopeType = 'ORGANIZATION' | 'EVENT' | 'PERFORMANCE';

export type SalesSummary = SalesFigures & {
  scope: { type: SalesScopeType; eventId?: string; performanceId?: string; name?: string };
  from: string;
  to: string;
  timezone: string;
  provisional: boolean;
  capacity?: number;
  sellThrough?: number;
};

export type SalesGrouping = 'hour' | 'day' | 'week';

export type SalesTrendBucket = SalesFigures & { start: string };

export type SalesTrend = {
  groupBy: SalesGrouping;
  timezone: string;
  from: string;
  to: string;
  provisional: boolean;
  buckets: SalesTrendBucket[];
};

export type SalesBreakdownRow = SalesFigures & {
  key: string;
  performanceId: string;
  eventId: string;
  label: string;
  detail?: string;
  performanceTitle?: string;
  startsAt?: string;
  provisional: boolean;
  capacity?: number;
  sellThrough?: number;
};

export type SalesBreakdown = {
  by: 'performance' | 'offer';
  timezone: string;
  from: string;
  to: string;
  provisional: boolean;
  rows: SalesBreakdownRow[];
};

export type SalesPerformanceStatus = {
  performanceId: string;
  eventId: string;
  title: string;
  startsAt: string;
  netTickets: number;
  capacity?: number;
  sellThrough?: number;
};

export type SalesEventOption = {
  eventId: string;
  title: string;
  performances: { id: string; title: string; startsAt: string; timezone: string }[];
};

export type SalesEventPage = {
  content: SalesEventOption[];
  page: number;
  size: number;
  hasMore: boolean;
};

export type SalesQuery = {
  eventId?: string;
  performanceId?: string;
  from: string;
  to: string;
};

const base = '/api/organizer/sales';

function query(input: SalesQuery, extra: Record<string, string> = {}) {
  const params = new URLSearchParams({ from: input.from, to: input.to, ...extra });
  if (input.performanceId) params.set('performanceId', input.performanceId);
  else if (input.eventId) params.set('eventId', input.eventId);
  return params.toString();
}

export function getSalesSummary(input: SalesQuery, signal?: AbortSignal) {
  return apiGet<SalesSummary>(`${base}/summary?${query(input)}`, signal);
}

export function getSalesTrend(input: SalesQuery, groupBy?: SalesGrouping, signal?: AbortSignal) {
  return apiGet<SalesTrend>(`${base}/trend?${query(input, groupBy ? { groupBy } : {})}`, signal);
}

export function getSalesBreakdown(
  input: SalesQuery,
  by: 'performance' | 'offer',
  signal?: AbortSignal,
) {
  return apiGet<SalesBreakdown>(`${base}/breakdown?${query(input, { by })}`, signal);
}

/** Events with performances in the organization. Needs EVENTS or FINANCE, unlike the Catalog event directory. */
export function getSalesEvents(search: string | undefined, size = 20, signal?: AbortSignal) {
  const params = new URLSearchParams({ size: String(size) });
  if (search) params.set('q', search);
  return apiGet<SalesEventPage>(`${base}/events?${params}`, signal);
}

export function getSalesOnSale(signal?: AbortSignal) {
  return apiGet<SalesPerformanceStatus[]>(`${base}/on-sale`, signal);
}

export function getSalesUpcoming(days: number, signal?: AbortSignal) {
  return apiGet<SalesPerformanceStatus[]>(`${base}/upcoming?days=${days}`, signal);
}

/** The filename the server chose in Content-Disposition, when present. */
export function filenameFromDisposition(header: unknown): string | undefined {
  if (typeof header !== 'string') return undefined;
  const encoded = /filename\*\s*=\s*(?:UTF-8|utf-8)''([^;]+)/.exec(header);
  if (encoded) {
    try {
      return decodeURIComponent(encoded[1].trim());
    } catch {
      /* fall through to the plain form */
    }
  }
  const plain = /filename\s*=\s*"?([^";]+)"?/.exec(header);
  return plain ? plain[1].trim() : undefined;
}

export async function exportSalesReport(
  input: SalesQuery,
  format: 'csv' | 'pdf',
  signal?: AbortSignal,
): Promise<{ blob: Blob; filename?: string }> {
  const response = await api.get<unknown, { data: Blob; headers: Record<string, unknown> }>(
    `${base}/export?${query(input, { format })}`,
    { responseType: 'blob', includeHeaders: true, signal },
  );
  return {
    blob: response.data,
    filename: filenameFromDisposition(response.headers?.['content-disposition']),
  };
}
