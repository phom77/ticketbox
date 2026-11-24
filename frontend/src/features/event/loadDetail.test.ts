import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiClientError } from '../../api/client';

vi.mock('../../api/concerts', () => ({ getConcert: vi.fn(), getConcertTicketTypes: vi.fn() }));
vi.mock('../../api/performances', () => ({ getEvent: vi.fn(), getAvailability: vi.fn() }));
vi.mock('../../api/publication', () => ({ getConcertPreview: vi.fn() }));

import { getConcert } from '../../api/concerts';
import { getEvent } from '../../api/performances';
import { loadDetail } from './useEventDetail';

const concert = {
  id: 'c1',
  title: 'Legacy show',
  description: 'About',
  artistBio: 'Bio',
  posterUrl: 'https://img.example/p.jpg',
  organizationName: ' Organizer Co ',
  seatMapSvg: '<svg></svg>',
  ticketTypes: [],
  eventDate: '2027-01-01T12:00:00Z',
  venueName: 'Hall',
  venueAddress: 'Street, Hà Nội',
  doorsOpenAt: null,
  saleStartAt: '2026-12-01T00:00:00Z',
  saleEndAt: null,
  status: 'ON_SALE',
};
const performance = (legacyConcertId: string | null) => ({
  id: 'p1',
  startsAt: '2027-01-01T12:00:00Z',
  endsAt: null,
  timezone: 'Asia/Ho_Chi_Minh',
  venueName: 'Hall',
  saleStartAt: '2026-12-01T00:00:00Z',
  saleEndAt: null,
  status: 'ON_SALE',
  salesSuspended: false,
  legacyConcertId,
});

describe('loadDetail', () => {
  const signal = new AbortController().signal;
  beforeEach(() => vi.mocked(getConcert).mockReset());

  it('enriches a legacy-backed event with the concert organizer and poster', async () => {
    vi.mocked(getEvent).mockResolvedValue({
      id: 'c1',
      title: 'Legacy show',
      description: '',
      performances: [performance('c1')],
    } as never);
    vi.mocked(getConcert).mockResolvedValue(concert as never);
    const model = await loadDetail('c1', false, signal);
    expect(model.eventId).toBe('c1');
    expect(model.organizer).toBe('Organizer Co');
    expect(model.posterUrl).toBe(concert.posterUrl);
    expect(model.dates[0].timezone).toBe('Asia/Ho_Chi_Minh');
  });

  it('keeps the event model when the concert read fails', async () => {
    vi.mocked(getEvent).mockResolvedValue({
      id: 'c1',
      title: 'T',
      description: '',
      performances: [performance('c1')],
    } as never);
    vi.mocked(getConcert).mockRejectedValue(new Error('down'));
    const model = await loadDetail('c1', false, signal);
    expect(model.organizer).toBeNull();
    expect(model.dates).toHaveLength(1);
  });

  it('does not read a concert for new-model events', async () => {
    vi.mocked(getEvent).mockResolvedValue({
      id: 'e1',
      title: 'T',
      description: '',
      performances: [performance(null)],
    } as never);
    await loadDetail('e1', false, signal);
    expect(getConcert).not.toHaveBeenCalled();
  });

  it('falls back to the concert when the event does not exist', async () => {
    vi.mocked(getEvent).mockRejectedValue(new ApiClientError('missing', 404));
    vi.mocked(getConcert).mockResolvedValue(concert as never);
    const model = await loadDetail('c1', false, signal);
    expect(model.eventId).toBeNull();
    expect(model.organizer).toBe('Organizer Co');
  });
});
