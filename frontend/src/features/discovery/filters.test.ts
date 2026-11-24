import { describe, expect, it } from 'vitest';
import {
  currentMonthRange,
  daysFromToday,
  discoverySearch,
  readDiscoveryFilters,
  readPageDepth,
  writeDiscoveryFilters,
  type DiscoveryFilters,
} from './filters';

// Tuesday 24 November 2026, 10:00 in Ho Chi Minh City.
const now = Date.parse('2026-11-24T03:00:00Z');

function filters(overrides: Partial<DiscoveryFilters> = {}): DiscoveryFilters {
  return { ...readDiscoveryFilters(new URLSearchParams()), ...overrides };
}

describe('readDiscoveryFilters', () => {
  it('maps legacy status values and trims the search text', () => {
    expect(readDiscoveryFilters(new URLSearchParams('q=  jazz &status=ON_SALE'))).toMatchObject({
      q: 'jazz',
      status: 'on-sale',
    });
    expect(readDiscoveryFilters(new URLSearchParams('status=Hết vé')).status).toBe('sold-out');
    expect(readDiscoveryFilters(new URLSearchParams('status=bogus')).status).toBe('');
  });

  it('reads city, category and price filters', () => {
    const params = new URLSearchParams('city=Hanoi&category=jazz&price=under-500000&price2=x');
    expect(readDiscoveryFilters(params)).toMatchObject({
      city: 'Hanoi',
      category: 'jazz',
      price: 'under-500000',
    });
    expect(readDiscoveryFilters(new URLSearchParams('price=free')).price).toBe('');
  });

  it('infers a custom range from dates and ignores dates for preset ranges', () => {
    expect(
      readDiscoveryFilters(new URLSearchParams('from=2026-12-01&to=2026-12-31')),
    ).toMatchObject({ date: 'custom', from: '2026-12-01', to: '2026-12-31' });
    expect(readDiscoveryFilters(new URLSearchParams('date=today&from=2026-12-01'))).toMatchObject({
      date: 'today',
      from: '',
      to: '',
    });
  });

  it('drops impossible or malformed dates', () => {
    expect(
      readDiscoveryFilters(new URLSearchParams('from=2026-02-30&to=12/31/2026')),
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

describe('discoverySearch', () => {
  it('sends filters to the server and turns price presets into a range', () => {
    const search = new URLSearchParams(
      discoverySearch(
        filters({
          q: 'jazz',
          city: 'Hanoi',
          category: 'jazz',
          price: '500000-1000000',
          status: 'on-sale',
        }),
      ),
    );
    expect(Object.fromEntries(search)).toEqual({
      q: 'jazz',
      city: 'Hanoi',
      category: 'jazz',
      status: 'on-sale',
      minPrice: '500000',
      maxPrice: '1000000',
    });
    expect(discoverySearch(filters())).toBe('');
  });
});

describe('date helpers', () => {
  it('measures days from today and finds the month in the concert time zone', () => {
    expect(daysFromToday(Date.parse('2026-11-24T17:30:00Z'), now)).toBe(1);
    expect(daysFromToday(Date.parse('2026-11-24T10:00:00Z'), now)).toBe(0);
    expect(currentMonthRange(now)).toEqual({ from: '2026-11-01', to: '2026-11-30' });
  });
  it('reads the requested page depth defensively', () => {
    expect(readPageDepth(new URLSearchParams('page=3'))).toBe(3);
    expect(readPageDepth(new URLSearchParams('page=-2'))).toBe(1);
    expect(readPageDepth(new URLSearchParams('page=x'))).toBe(1);
  });
});
