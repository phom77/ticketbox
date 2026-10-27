import { api, apiGet } from './client';
import type { Page } from './concerts';

export type OrganizerConcert = {
  id: string;
  title: string;
  eventDate: string;
  status: 'COMPLETED';
};

export type RevenueSummary = {
  concertId: string;
  totalRevenue: number;
  totalTicketsSold: number;
  totalTicketsAvailable: number;
  soldRate: number;
};

export type ZoneRevenue = {
  zoneName: string;
  price: number;
  soldQuantity: number;
  availableQuantity: number;
  totalQuantity: number;
  revenue: number;
  soldRate: number;
};

export type SalesTrend = {
  date: string;
  ticketsSold: number;
  revenue: number;
};

export function getOrganizerRevenueConcerts(signal?: AbortSignal) {
  return apiGet<Page<OrganizerConcert>>('/api/organizer/concerts?page=0&size=100', signal);
}

export function getRevenueSummary(concertId: string, signal?: AbortSignal) {
  return apiGet<RevenueSummary>(
    `/api/organizer/concerts/${encodeURIComponent(concertId)}/revenue-summary`,
    signal,
  );
}

export function getZoneRevenue(concertId: string, signal?: AbortSignal) {
  return apiGet<ZoneRevenue[]>(
    `/api/organizer/concerts/${encodeURIComponent(concertId)}/zone-revenue`,
    signal,
  );
}

export function getSalesTrend(
  concertId: string,
  from: string,
  to: string,
  signal?: AbortSignal,
) {
  const params = new URLSearchParams({ from, to, groupBy: 'day' });
  return apiGet<SalesTrend[]>(
    `/api/organizer/concerts/${encodeURIComponent(concertId)}/sales-trend?${params}`,
    signal,
  );
}

export function exportRevenueReport(concertId: string, format: 'csv' | 'pdf') {
  const params = new URLSearchParams({ format });
  return api.get<unknown, Blob>(
    `/api/organizer/concerts/${encodeURIComponent(concertId)}/revenue-report/export?${params}`,
    { responseType: 'blob' },
  );
}
