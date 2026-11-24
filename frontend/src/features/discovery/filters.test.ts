import { describe, expect, it } from 'vitest';
import {
  filterConcerts,
  readDiscoveryFilters,
  writeDiscoveryFilters,
  type DiscoveryConcert,
  type DiscoveryFilters,
} from './filters';

// Tuesday 24 November 2026, 10:00 in Ho Chi Minh City.
const now = Date.parse('2026-11-24T03:00:00Z');

function concert(overrides: Partial<DiscoveryConcert> = {}): DiscoveryConcert {
  return {
    id: 'concert',
    title: 'Hà Nội Jazz Night',
    venueName: 'Nhà hát Lớn',
    eventDate: '2026-12-05T12:00:00Z',
    saleStartAt: '2026-11-01T00:00:00Z',
    saleEndAt: null,
    status: 'ON_SALE',
    posterUrl: null,
    ...overrides,
  };
}

function filters(overrides: Partial<DiscoveryFilters> = {}): DiscoveryFilters {
  return { ...readDiscoveryFilters(new URLSearchParams(), false), ...overrides };
}

const ids = (concerts: DiscoveryConcert[]) => concerts.map(({ id }) => id);

describe('readDiscoveryFilters', () => {
  it('maps legacy status values and trims the search text', () => {
    expect(
      readDiscoveryFilters(new URLSearchParams('q=  jazz &status=ON_SALE'), false),
    ).toMatchObject({ q: 'jazz', status: 'on-sale' });
    expect(readDiscoveryFilters(new URLSearchParams('status=Hết vé'), false).status).toBe(
      'sold-out',
    );
    expect(readDiscoveryFilters(new URLSearchParams('status=bogus'), false).status).toBe('');
  });

  it('reads preview-only filters only on the preview route', () => {
    const params = new URLSearchParams('city=hanoi&category=jazz&price=under-500000');
    expect(readDiscoveryFilters(params, false)).toMatchObject({
      city: '',
      category: '',
      price: '',
    });
    expect(readDiscoveryFilters(params, true)).toMatchObject({
      city: 'hanoi',
      category: 'jazz',
      price: 'under-500000',
    });
  });

  it('infers a custom range from dates and ignores dates for preset ranges', () => {
    expect(
      readDiscoveryFilters(new URLSearchParams('from=2026-12-01&to=2026-12-31'), false),
    ).toMatchObject({ date: 'custom', from: '2026-12-01', to: '2026-12-31' });
    expect(
      readDiscoveryFilters(new URLSearchParams('date=today&from=2026-12-01'), false),
    ).toMatchObject({ date: 'today', from: '', to: '' });
  });

  it('drops impossible or malformed dates', () => {
    expect(
      readDiscoveryFilters(new URLSearchParams('from=2026-02-30&to=12/31/2026'), false),
    ).toMatchObject({ date: '', from: '', to: '' });
  });
});

describe('writeDiscoveryFilters', () => {
  it('sets non-empty values, removes cleared ones and keeps the rest', () => {
    const next = writeDiscoveryFilters(new URLSearchParams('q=jazz&status=on-sale'), {
      status: '',
      sort: 'sale-start',
    });
    expect(next.toString()).toBe('q=jazz&sort=sale-start');
  });
});

describe('filterConcerts', () => {
  it('hides drafts, and hides past events unless the buyer searches or filters', () => {
    const concerts = [
      concert({ id: 'upcoming' }),
      concert({ id: 'draft', status: 'DRAFT' }),
      concert({ id: 'past', eventDate: '2026-11-01T12:00:00Z' }),
    ];
    expect(ids(filterConcerts(concerts, filters(), now))).toEqual(['upcoming']);
    expect(ids(filterConcerts(concerts, filters({ q: 'jazz' }), now))).toEqual([
      'past',
      'upcoming',
    ]);
  });

  it('matches search words regardless of Vietnamese accents, case and translations', () => {
    const concerts = [
      concert({ id: 'title' }),
      concert({ id: 'dem', title: 'Đêm nhạc mùa thu', venueName: 'Saigon Opera House' }),
      concert({
        id: 'translated',
        title: 'Dạ tiệc',
        venueName: 'Saigon Opera House',
        translations: { en: { title: 'Autumn Gala', description: null } },
      }),
    ];
    expect(ids(filterConcerts(concerts, filters({ q: 'HA NOI jazz' }), now))).toEqual(['title']);
    expect(ids(filterConcerts(concerts, filters({ q: 'nha hat' }), now))).toEqual(['title']);
    expect(ids(filterConcerts(concerts, filters({ q: 'dem nhac' }), now))).toEqual(['dem']);
    expect(ids(filterConcerts(concerts, filters({ q: 'autumn' }), now))).toEqual(['translated']);
  });

  it('uses the concert time zone for "today"', () => {
    const concerts = [
      concert({ id: 'tonight', eventDate: '2026-11-24T13:00:00Z' }), // 20:00 on the 24th locally
      concert({ id: 'after-midnight', eventDate: '2026-11-24T18:00:00Z' }), // 01:00 on the 25th
    ];
    expect(ids(filterConcerts(concerts, filters({ date: 'today' }), now))).toEqual(['tonight']);
  });

  it('limits "this weekend" to the coming Saturday and Sunday', () => {
    const concerts = ['27', '28', '29', '30'].map((day) =>
      concert({ id: day, eventDate: `2026-11-${day}T12:00:00Z` }),
    );
    expect(ids(filterConcerts(concerts, filters({ date: 'weekend' }), now))).toEqual(['28', '29']);
  });

  it('filters by sale state, treating suspended performances as closed', () => {
    const concerts = [
      concert({ id: 'on-sale' }),
      concert({ id: 'sold-out', status: 'SOLD_OUT' }),
      concert({ id: 'suspended', performance: { eventId: 'event', salesSuspended: true } }),
    ];
    expect(ids(filterConcerts(concerts, filters({ status: 'on-sale' }), now))).toEqual(['on-sale']);
    expect(ids(filterConcerts(concerts, filters({ status: 'sold-out' }), now))).toEqual([
      'sold-out',
    ]);
    expect(ids(filterConcerts(concerts, filters({ status: 'closed' }), now))).toEqual([
      'suspended',
    ]);
  });

  it('sorts by event date by default, or by sale start when requested', () => {
    const concerts = [
      concert({
        id: 'late-show',
        eventDate: '2026-12-20T12:00:00Z',
        saleStartAt: '2026-11-01T00:00:00Z',
      }),
      concert({
        id: 'early-show',
        eventDate: '2026-12-01T12:00:00Z',
        saleStartAt: '2026-11-10T00:00:00Z',
      }),
    ];
    expect(ids(filterConcerts(concerts, filters(), now))).toEqual(['early-show', 'late-show']);
    expect(ids(filterConcerts(concerts, filters({ sort: 'sale-start' }), now))).toEqual([
      'late-show',
      'early-show',
    ]);
  });

  it('shows one card per event when it has several performances', () => {
    const performance = { eventId: 'tour', salesSuspended: false };
    const concerts = [
      concert({ id: 'second-night', eventDate: '2026-12-06T12:00:00Z', performance }),
      concert({ id: 'first-night', eventDate: '2026-12-05T12:00:00Z', performance }),
      concert({ id: 'other' }),
    ];
    expect(ids(filterConcerts(concerts, filters(), now))).toEqual(['first-night', 'other']);
  });
});
