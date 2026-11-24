import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Order } from '../../api/orders';
import type { Ticket } from '../../api/tickets';
import {
  clearConcertViewCache,
  concertView,
  loadConcertView,
  orderView,
  performanceView,
  purchasePaths,
  ticketView,
} from './eventView';

const getConcert = vi.hoisted(() => vi.fn());
vi.mock('../../api/concerts', () => ({ getConcert }));

const concert = {
  id: 'concert-1',
  title: 'Jazz Night',
  translations: { en: { title: 'Jazz Night', description: null } },
  venueName: 'Hanoi Opera House',
  eventDate: '2027-01-10T12:30:00Z',
  posterUrl: 'https://img.example/poster.jpg',
};

const order = {
  id: 'order-1',
  concertId: 'concert-1',
  concertTitle: 'Jazz Night (order)',
  status: 'AWAITING_PAYMENT',
  totalAmount: 100,
  paymentUrl: null,
  expiresAt: '2027-01-01T00:00:00Z',
  createdAt: '2027-01-01T00:00:00Z',
  items: [],
} satisfies Order;

describe('EventView adapter', () => {
  beforeEach(() => {
    clearConcertViewCache();
    getConcert.mockReset();
  });
  afterEach(() => vi.restoreAllMocks());

  it('normalises a legacy concert', () => {
    expect(concertView(concert)).toEqual({
      id: 'concert-1',
      title: 'Jazz Night',
      translations: concert.translations,
      venue: 'Hanoi Opera House',
      date: '2027-01-10T12:30:00Z',
      image: 'https://img.example/poster.jpg',
    });
  });

  it('normalises an event performance', () => {
    const view = performanceView(
      { id: 'event-1', title: 'Tour' },
      {
        id: 'show-1',
        venueName: 'Arena',
        startsAt: '2027-02-01T12:00:00Z',
        timezone: 'Asia/Ho_Chi_Minh',
      },
    );
    expect(view).toMatchObject({
      id: 'show-1',
      eventId: 'event-1',
      venue: 'Arena',
      timezone: 'Asia/Ho_Chi_Minh',
    });
  });

  it('uses performance fields on orders and tickets without Catalog', () => {
    const performanceOrder = {
      ...order,
      performanceId: 'show-1',
      eventId: 'event-1',
      performanceTitle: 'Tour',
      performanceVenueName: 'Arena',
      performanceStartsAt: '2027-02-01T12:00:00Z',
    };
    expect(orderView(performanceOrder)).toMatchObject({
      id: 'show-1',
      eventId: 'event-1',
      title: 'Tour',
      venue: 'Arena',
    });
    const ticket = {
      id: 't-1',
      concertId: 'c',
      concertTitle: 'Tour',
      ticketTypeId: 'tt',
      ticketTypeName: 'GA',
      qrCode: 'qr',
      status: 'VALID',
      issuedAt: '2027-01-01T00:00:00Z',
      performanceId: 'show-1',
      eventId: 'event-1',
      performanceVenueName: 'Arena',
      performanceStartsAt: '2027-02-01T12:00:00Z',
    } satisfies Ticket;
    expect(ticketView(ticket)).toMatchObject({ id: 'show-1', venue: 'Arena' });
  });

  it('falls back to order data when Catalog details are missing', () => {
    expect(orderView(order)).toMatchObject({
      id: 'concert-1',
      title: 'Jazz Night (order)',
      venue: '',
    });
    expect(orderView(order, concertView(concert))).toMatchObject({
      title: 'Jazz Night',
      venue: 'Hanoi Opera House',
    });
  });

  it('builds purchase paths for both models', () => {
    expect(purchasePaths({ id: 'concert 1' })).toEqual({
      details: '/concerts/concert%201',
      waitingRoom: '/concerts/concert%201/waiting-room',
      selection: '/events/concert%201/tickets',
    });
    expect(purchasePaths({ id: 'show-1', eventId: 'event-1' })).toEqual({
      details: '/events/event-1',
      waitingRoom: '/events/event-1/performances/show-1/waiting-room',
      selection: '/events/event-1/performances/show-1/tickets',
    });
  });

  it('deduplicates Catalog lookups and does not cache failures', async () => {
    getConcert.mockResolvedValue(concert);
    const [first, second] = await Promise.all([
      loadConcertView('concert-1'),
      loadConcertView('concert-1'),
    ]);
    expect(first).toEqual(second);
    expect(getConcert).toHaveBeenCalledTimes(1);

    getConcert.mockRejectedValueOnce(new Error('down'));
    expect(await loadConcertView('concert-2')).toBeNull();
    getConcert.mockResolvedValueOnce({ ...concert, id: 'concert-2' });
    expect(await loadConcertView('concert-2')).toMatchObject({ id: 'concert-2' });
  });
});
