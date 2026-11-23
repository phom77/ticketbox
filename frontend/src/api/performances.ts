import { api, publicGet } from './client';
import type { ConcertStatus, Page } from './concerts';
import type { Order } from './orders';

export type Performance = {
  id: string;
  eventId: string;
  venueName: string;
  startsAt: string;
  endsAt: string;
  timezone: string;
  status: ConcertStatus;
  salesSuspended: boolean;
  saleStartAt: string;
  saleEndAt: string;
  saleVersion: number;
  layoutVersion: number | null;
  legacyConcertId: string | null;
};

export type EventDetails = {
  id: string;
  title: string;
  description: string | null;
  performances: Performance[];
};

export type Point = { x: number; y: number };
export type SectionKind = 'GA' | 'ASSIGNED';
export type MapShape = { kind: string; label: string; points: Point[] };
export type Seat = Point & {
  id: string;
  label: string;
  accessible: boolean;
  restrictedView: boolean;
  segment: string;
  position: number;
  blocked: boolean;
};
export type Section = {
  id: string;
  code: string;
  label: string;
  kind: SectionKind;
  points: Point[];
};
export type MapSection = Section & { rows: Array<{ id: string; code: string; label: string; seats: Seat[] }> };
export type Layout = {
  version: number;
  width: number;
  height: number;
  backgroundUrl?: string | null;
  shapes: MapShape[];
  sections: Section[];
};

export type Offer = { id: string; name: string; price: number; active: boolean };
export type AvailableGroup = {
  id: string;
  sectionId: string | null;
  sectionLabel: string;
  kind: SectionKind;
  available: number;
  offers: Offer[];
};
export type Availability = {
  layoutVersion: number | null;
  saleVersion: number;
  groups: AvailableGroup[];
};
export type SectionAvailability = {
  layoutVersion: number;
  saleVersion: number;
  sectionId: string;
  seats: Array<{ id: string; available: boolean; groupId: string }>;
};
export type Selection = { offerId: string; quantity: number } | { offerId: string; seatId: string };
export type HeldItem = {
  offerId: string;
  seatId: string | null;
  quantity: number;
  unitPrice: number;
  offerName: string;
  sectionLabel: string;
  rowLabel: string | null;
  seatLabel: string | null;
};
export type PerformanceHold = { version: number; expiresAt: string | null; items: HeldItem[]; totalAmount: number };

export const eventPath = (id: string) => '/events/' + encodeURIComponent(id);
export const performancePath = (eventId: string, id: string) => eventPath(eventId) + '/performances/' + encodeURIComponent(id);
const inventory = (id: string) => '/api/v2/performances/' + encodeURIComponent(id);
const sectionPath = (id: string) => '/sections/' + encodeURIComponent(id);

export function listEvents(page: number, signal: AbortSignal, size = 12) {
  return publicGet<Page<EventDetails>>('/api/v2/events?page=' + page + '&size=' + size, signal);
}

export function getEvent(id: string, signal?: AbortSignal) {
  return publicGet<EventDetails>('/api/v2' + eventPath(id), signal);
}

export async function getEventPerformance(eventId: string, id: string, signal?: AbortSignal) {
  const event = await getEvent(eventId, signal);
  const performance = event.performances.find((entry) => entry.id === id);
  if (!performance) throw new Error('Performance does not belong to this event');
  return { event, performance };
}

export function getLayout(id: string, signal: AbortSignal) {
  return publicGet<Layout>(inventory(id) + '/layout', signal);
}

export function getMapSection(id: string, sectionId: string, signal: AbortSignal) {
  return publicGet<{ version: number; section: MapSection }>(inventory(id) + '/layout' + sectionPath(sectionId), signal);
}

export function getAvailability(id: string, signal?: AbortSignal) {
  return publicGet<Availability>(inventory(id) + '/availability', signal);
}

export function getSectionAvailability(id: string, sectionId: string, signal: AbortSignal) {
  return publicGet<SectionAvailability>(inventory(id) + '/availability' + sectionPath(sectionId), signal);
}

export function getHold(id: string, token: string, signal?: AbortSignal) {
  return api.get<unknown, PerformanceHold>(inventory(id) + '/hold', {
    signal, headers: { 'Queue-Access-Token': token },
  });
}

export function replaceHold(id: string, token: string, key: string, body: {
  layoutVersion: number | null;
  holdVersion: number;
  items: Selection[];
}) {
  return api.put<unknown, PerformanceHold>(inventory(id) + '/hold', body, {
    timeout: 12_000, headers: { 'Queue-Access-Token': token, 'Idempotency-Key': key },
  });
}

export function checkoutPerformance(id: string, token: string, key: string, holdVersion: number) {
  return api.post<unknown, Order>(inventory(id) + '/orders', { holdVersion }, {
    timeout: 15_000, headers: { 'Queue-Access-Token': token, 'Idempotency-Key': key },
  });
}
