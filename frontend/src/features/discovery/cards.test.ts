import { describe, expect, it } from 'vitest';
import { eventCard, homeRows } from './cards';
import type { DiscoveryConcert } from './filters';

// Tuesday 24 November 2026, 10:00 in Ho Chi Minh City.
const now = Date.parse('2026-11-24T03:00:00Z');
const day = (days: number) => new Date(now + days * 86_400_000).toISOString();

function concert(id: string, overrides: Partial<DiscoveryConcert> = {}): DiscoveryConcert {
  return {
    id,
    title: id,
    venueName: 'Nhà hát Lớn',
    eventDate: day(10),
    saleStartAt: day(-3),
    saleEndAt: null,
    status: 'ON_SALE',
    posterUrl: null,
    ...overrides,
  };
}

describe('homeRows', () => {
  it('groups upcoming events and fills highlights, pictures first', () => {
    const rows = homeRows(
      [
        concert('tonight', { eventDate: day(0.2), posterUrl: 'poster.jpg' }),
        concert('later', { posterUrl: 'poster.jpg' }),
        concert('plain'),
        concert('soon', { saleStartAt: day(5) }),
        concert('sold', { status: 'SOLD_OUT', eventDate: day(2) }),
        concert('gone', { eventDate: day(1), saleEndAt: day(-1) }),
      ],
      now,
    );
    expect(rows.highlights.map(({ id }) => id)).toEqual(['tonight', 'later', 'plain', 'soon']);
    expect(rows.thisWeek.map(({ id }) => id)).toEqual(['tonight', 'sold']);
    expect(rows.onSale.map(({ id }) => id)).toEqual(['tonight', 'later', 'plain']);
    expect(rows.comingSoon.map(({ id }) => id)).toEqual(['soon']);
  });
});

describe('eventCard', () => {
  it('carries price, city, date count and a relative day badge', () => {
    const card = eventCard(
      concert('a', { eventDate: day(1), city: 'Hanoi', minPrice: 300_000, performanceCount: 3 }),
      now,
      true,
    );
    expect(card).toMatchObject({
      city: 'Hanoi',
      minPrice: 300_000,
      performanceCount: 3,
      dayBadge: 'tomorrow',
      href: '/concerts/a',
    });
    expect(eventCard(concert('b', { eventDate: day(1) }), now).dayBadge).toBeNull();
  });
});
