import { api, apiGet } from './client';
import type { ConcertTranslations, Page } from './concerts';
import type {
  AgeRating,
  EventDetails,
  Layout,
  MapSection,
  Performance,
  SectionKind,
} from './performances';
import type { PublicationReview, ReviewDecision } from './publication';

const root = '/api/organizer/manage/v2';
const events = root + '/events';
const venues = root + '/venues';
const key = encodeURIComponent;
const performance = (id: string) => root + '/performances/' + key(id);
const eventPath = (id: string) => events + '/' + key(id);
const venueTemplates = (id: string) => venues + '/' + key(id) + '/templates';

export type Venue = {
  id: string;
  name: string;
  address: string;
  city: string | null;
  timezone: string;
  capacityHint: number | null;
  version: number;
  spaces: { id: string; name: string }[];
};
/** A draft may have no sale start yet (for example a copied date whose shifted start is past). */
export type ManagedPerformance = Omit<Performance, 'saleStartAt'> & {
  saleStartAt: string | null;
  draftVersion: number;
  venueSpaceId: string;
  venueAddress: string;
  spaceName: string;
  doorsOpenAt: string | null;
  maxPerAccount: number;
  publicVisible: boolean;
};
export type ManagedEvent = Omit<EventDetails, 'performances'> & {
  /** Token of the publication review; moves when the title or description changes. */
  draftVersion: number;
  /** Optimistic lock of the content editors. */
  contentVersion: number;
  performances: ManagedPerformance[];
};
export type DraftLayout = Omit<Layout, 'version' | 'sections'> & { sections: MapSection[] };
export type LayoutDraft = { version: number; layout: DraftLayout | null };
export type LayoutTemplate = { id: string; name: string; venueSpaceId: string; revision: number };
export type SaleGroup = {
  id: string;
  sectionId: string | null;
  sectionLabel: string;
  kind: SectionKind;
  capacity: number;
  seats: { id: string; rowLabel: string; seatLabel: string; blocked: boolean }[];
};
export type SaleOffer = {
  id: string;
  groupId: string;
  name: string;
  price: number;
  currency: 'VND';
  saleStartAt: string;
  saleEndAt: string;
  active: boolean;
  /** Buyer-facing perks, up to 500 characters. */
  description?: string | null;
  /** Fewest places of this ticket type in one order. Absent means 1. */
  minPerOrder?: number;
};
export type SaleDraft = { version: number; groups: SaleGroup[]; offers: SaleOffer[] };
export type PerformanceReview = {
  id: string;
  performanceId: string;
  /** Empty for a release-on-approval review until it is approved. */
  publishAt: string | null;
  releaseOnApproval?: boolean;
  state: PublicationReview['state'];
  reason: string | null;
  summary: {
    title: string;
    description: string | null;
    venueName: string;
    spaceName: string;
    startsAt: string;
    saleStartAt: string;
    saleEndAt: string;
    publicVisible: boolean;
    offers: {
      name: string;
      price: number;
      active: boolean;
      saleStartAt: string;
      saleEndAt: string;
    }[];
  };
};
export type Publication = {
  status: string;
  saleVersion: number;
  ticketingAcknowledged: boolean;
  checkinAcknowledged: boolean;
  review: PerformanceReview | null;
};
const reviewPath = '/api/admin/v2/performance-reviews';
export const getPerformanceReviewQueue = (signal?: AbortSignal) =>
  apiGet<PerformanceReview[]>(reviewPath, signal);
export const decidePerformanceReview = (
  id: string,
  revision: string,
  action: ReviewDecision | 'HOLD',
  reason: string,
) => api.post<unknown, PerformanceReview>(reviewPath + '/' + key(id), { revision, action, reason });
export type EventContentInput = {
  title: string;
  description: string;
  translations: ConcertTranslations;
  artistBio: string;
  ageRating: AgeRating | null;
  refundPolicy: string;
};
export type EventInput = EventContentInput & {
  segment: string;
  primaryGenre: string;
  genres: string[];
};
type VenueInput = { name: string; address: string; spaceName: string };
export type PerformanceInput = Pick<
  ManagedPerformance,
  | 'venueSpaceId'
  | 'startsAt'
  | 'endsAt'
  | 'doorsOpenAt'
  | 'timezone'
  | 'saleStartAt'
  | 'saleEndAt'
  | 'maxPerAccount'
  | 'publicVisible'
>;

export const listManagedEvents = (page: number, signal?: AbortSignal) =>
  apiGet<Page<ManagedEvent>>(events + '?page=' + page + '&size=12', signal);
export const getManagedEvent = (id: string, signal?: AbortSignal) =>
  apiGet<ManagedEvent>(eventPath(id), signal);
export const createManagedEvent = (body: EventInput) =>
  api.post<unknown, ManagedEvent>(events, body);
export const updateManagedEvent = (id: string, expectedContentVersion: number, body: EventInput) =>
  api.put<unknown, ManagedEvent>(eventPath(id), { ...body, expectedContentVersion });
export const deleteDraftPerformance = (id: string, expectedDraftVersion: number) =>
  api.delete<unknown, void>(performance(id) + '?expectedDraftVersion=' + expectedDraftVersion);
export const deleteDraftEvent = (id: string, expectedDraftVersion: number) =>
  api.delete<unknown, void>(eventPath(id) + '?expectedDraftVersion=' + expectedDraftVersion);
export const listVenues = (signal?: AbortSignal) => apiGet<Venue[]>(venues, signal);
export const createVenue = (body: VenueInput) => api.post<unknown, Venue>(venues, body);
export const createPerformance = (eventId: string, body: PerformanceInput) =>
  api.post<unknown, ManagedPerformance>(eventPath(eventId) + '/performances', body);

export const updatePerformanceSchedule = (
  id: string,
  expectedDraftVersion: number,
  body: PerformanceInput,
) =>
  api.put<unknown, ManagedPerformance>(performance(id) + '/schedule', {
    ...body,
    expectedDraftVersion,
  });

export const readLayoutDraft = (id: string, signal?: AbortSignal) =>
  apiGet<LayoutDraft>(performance(id) + '/layout', signal);
export const saveLayout = (id: string, expectedVersion: number, layout: DraftLayout) =>
  api.put<unknown, LayoutDraft>(performance(id) + '/layout', { expectedVersion, layout });
export const readDraftImage = (url: string, signal: AbortSignal) =>
  api.get<unknown, Blob>(url, { responseType: 'blob', signal });
export function uploadLayoutBackground(id: string, version: number, file: File) {
  const data = new FormData();
  data.set('file', file);
  return api.post<unknown, LayoutDraft>(
    performance(id) + '/layout/background?expectedVersion=' + version,
    data,
    {
      headers: { 'Content-Type': 'multipart/form-data' },
    },
  );
}
export const listLayoutTemplates = (venueId: string, signal?: AbortSignal) =>
  apiGet<LayoutTemplate[]>(venueTemplates(venueId), signal);
export const createLayoutTemplate = (
  venueId: string,
  venueSpaceId: string,
  name: string,
  layout: DraftLayout,
) => api.post<unknown, LayoutTemplate>(venueTemplates(venueId), { venueSpaceId, name, layout });
export const copyLayoutTemplate = (id: string, template: LayoutTemplate, expectedVersion: number) =>
  api.post<unknown, LayoutDraft>(performance(id) + '/layout/copy', {
    templateId: template.id,
    revision: template.revision,
    expectedVersion,
  });
export const getSaleDraft = (id: string, signal?: AbortSignal) =>
  apiGet<SaleDraft>(performance(id) + '/sale', signal);
export const saveSaleDraft = (id: string, sale: SaleDraft) =>
  api.put<unknown, SaleDraft>(performance(id) + '/sale', {
    expectedSaleVersion: sale.version,
    groups: sale.groups,
    offers: sale.offers,
  });
export const getPublication = (id: string, signal?: AbortSignal) =>
  apiGet<Publication>(performance(id) + '/publication', signal);
export const publishPerformance = (
  id: string,
  expectedSaleVersion: number,
  expectedLayoutVersion: number,
  draftVersions: { event: number; schedule: number },
  publishAt: string | null,
) =>
  api.post<unknown, Publication>(performance(id) + '/publication', {
    expectedSaleVersion,
    expectedLayoutVersion,
    releaseMode: publishAt ? 'SCHEDULED' : 'ON_APPROVAL',
    publishAt,
    expectedEventDraftVersion: draftVersions.event,
    expectedScheduleDraftVersion: draftVersions.schedule,
  });

export type PerformanceStaff = { staffId: string; grantedAt: string };
const staff = (id: string) => performance(id) + '/staff';
export const listPerformanceStaff = (id: string, signal?: AbortSignal) =>
  apiGet<PerformanceStaff[]>(staff(id), signal);
export const assignPerformanceStaff = (id: string, staffId: string) =>
  api.put(staff(id) + '/' + key(staffId));
export const revokePerformanceStaff = (id: string, staffId: string) =>
  api.delete(staff(id) + '/' + key(staffId));
