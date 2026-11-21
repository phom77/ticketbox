import { api, apiGet } from './client';
import type { Page } from './concerts';
import type { EventDetails, Layout, MapSection, Performance, SectionKind } from './performances';

const root = '/api/organizer/manage/v2';
const events = root + '/events';
const venues = root + '/venues';
const key = encodeURIComponent;
const performance = (id: string) => root + '/performances/' + key(id);
const eventPath = (id: string) => events + '/' + key(id);
const venueTemplates = (id: string) => venues + '/' + key(id) + '/templates';

export type Venue = { id: string; name: string; address: string; spaces: { id: string; name: string }[] };
export type ManagedPerformance = Performance & {
  draftVersion: number;
  venueSpaceId: string;
  venueAddress: string;
  spaceName: string;
  doorsOpenAt: string | null;
  maxPerAccount: number;
  publicVisible: boolean;
};
export type ManagedEvent = Omit<EventDetails, 'performances'> & { category?: string | null; draftVersion: number; performances: ManagedPerformance[] };
export type DraftLayout = Omit<Layout, 'version' | 'sections'> & { sections: MapSection[] };
export type LayoutDraft = { version: number; layout: DraftLayout | null };
export type LayoutTemplate = { id: string; name: string; venueSpaceId: string; revision: number };
export type SaleGroup = {
  id: string; sectionId: string | null; sectionLabel: string; kind: SectionKind; capacity: number;
  seats: { id: string; rowLabel: string; seatLabel: string; blocked: boolean }[];
};
export type SaleOffer = {
  id: string; groupId: string; name: string; price: number; currency: 'VND'; saleStartAt: string; saleEndAt: string;
  active: boolean;
};
export type SaleDraft = { version: number; groups: SaleGroup[]; offers: SaleOffer[] };
export type Publication = { status: string; saleVersion: number; ticketingAcknowledged: boolean; checkinAcknowledged: boolean };
export type EventInput = { title: string; description: string; category: string | null };
type VenueInput = { name: string; address: string; spaceName: string };
export type PerformanceInput = Pick<ManagedPerformance,
  'venueSpaceId' | 'startsAt' | 'endsAt' | 'doorsOpenAt' | 'timezone' | 'saleStartAt' | 'saleEndAt' | 'maxPerAccount' | 'publicVisible'>;

export const listManagedEvents = (page: number, signal?: AbortSignal) =>
  apiGet<Page<ManagedEvent>>(events + '?page=' + page + '&size=12', signal);
export const getManagedEvent = (id: string, signal?: AbortSignal) => apiGet<ManagedEvent>(eventPath(id), signal);
export const createManagedEvent = (body: EventInput) => api.post<unknown, ManagedEvent>(events, body);
export const updateManagedEvent = (id: string, expectedDraftVersion: number, body: EventInput) =>
  api.put<unknown, ManagedEvent>(eventPath(id), { ...body, expectedDraftVersion });
export const listVenues = (signal?: AbortSignal) => apiGet<Venue[]>(venues, signal);
export const createVenue = (body: VenueInput) => api.post<unknown, Venue>(venues, body);
export const createPerformance = (eventId: string, body: PerformanceInput) =>
  api.post<unknown, ManagedPerformance>(eventPath(eventId) + '/performances', body);

export const updatePerformanceSchedule = (id: string, expectedDraftVersion: number, body: PerformanceInput) =>
  api.put<unknown, ManagedPerformance>(performance(id) + '/schedule', { ...body, expectedDraftVersion });

export const readLayoutDraft = (id: string, signal?: AbortSignal) =>
  apiGet<LayoutDraft>(performance(id) + '/layout', signal);
export const saveLayout = (id: string, expectedVersion: number, layout: DraftLayout) =>
  api.put<unknown, LayoutDraft>(performance(id) + '/layout', { expectedVersion, layout });
export const readDraftImage = (url: string, signal: AbortSignal) =>
  api.get<unknown, Blob>(url, { responseType: 'blob', signal });
export function uploadLayoutBackground(id: string, version: number, file: File) {
  const data = new FormData();
  data.set('file', file);
  return api.post<unknown, LayoutDraft>(performance(id) + '/layout/background?expectedVersion=' + version, data, {
    headers: { 'Content-Type': 'multipart/form-data' },
  });
}
export const listLayoutTemplates = (venueId: string, signal?: AbortSignal) =>
  apiGet<LayoutTemplate[]>(venueTemplates(venueId), signal);
export const createLayoutTemplate = (venueId: string, venueSpaceId: string, name: string, layout: DraftLayout) =>
  api.post<unknown, LayoutTemplate>(venueTemplates(venueId), { venueSpaceId, name, layout });
export const copyLayoutTemplate = (id: string, template: LayoutTemplate, expectedVersion: number) =>
  api.post<unknown, LayoutDraft>(performance(id) + '/layout/copy', {
    templateId: template.id, revision: template.revision, expectedVersion,
  });
export const getSaleDraft = (id: string, signal?: AbortSignal) =>
  apiGet<SaleDraft>(performance(id) + '/sale', signal);
export const saveSaleDraft = (id: string, sale: SaleDraft) =>
  api.put<unknown, SaleDraft>(performance(id) + '/sale', {
    expectedSaleVersion: sale.version, groups: sale.groups, offers: sale.offers,
  });
export const getPublication = (id: string, signal?: AbortSignal) =>
  apiGet<Publication>(performance(id) + '/publication', signal);
export const publishPerformance = (id: string, expectedSaleVersion: number, expectedLayoutVersion: number,
  draftVersions?: { event: number; schedule: number }) =>
  api.post<unknown, Publication>(performance(id) + '/publication', {
    expectedSaleVersion, expectedLayoutVersion,
    expectedEventDraftVersion: draftVersions?.event, expectedScheduleDraftVersion: draftVersions?.schedule,
  });

export type PerformanceStaff = { staffId: string; grantedAt: string };
const staff = (id: string) => performance(id) + '/staff';
export const listPerformanceStaff = (id: string, signal?: AbortSignal) => apiGet<PerformanceStaff[]>(staff(id), signal);
export const assignPerformanceStaff = (id: string, staffId: string) => api.put(staff(id) + '/' + key(staffId));
export const revokePerformanceStaff = (id: string, staffId: string) => api.delete(staff(id) + '/' + key(staffId));
