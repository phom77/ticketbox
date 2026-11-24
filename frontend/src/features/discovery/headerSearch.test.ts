import { beforeEach, describe, expect, it } from 'vitest';
import {
  addRecentSearch,
  buildSuggestions,
  clearRecentSearches,
  combineQuery,
  readRecentSearches,
  recentSearchLabel,
  rememberSearchSplit,
  splitQuery,
  type SuggestionItem,
} from './headerSearch';

function item(patch: Partial<SuggestionItem>): SuggestionItem {
  return {
    id: 'show-1',
    title: 'Jazz Night',
    venueName: 'Nhà hát Lớn Hà Nội',
    eventDate: '2027-01-10T12:30:00Z',
    saleStartAt: '2026-12-01T00:00:00Z',
    saleEndAt: null,
    status: 'ON_SALE',
    posterUrl: null,
    ...patch,
  };
}

describe('header search helpers', () => {
  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
  });

  it('joins What and Where into one discovery query', () => {
    expect(combineQuery('  jazz  night ', ' Hà Nội ')).toBe('jazz night Hà Nội');
    expect(combineQuery('', 'Hue')).toBe('Hue');
    expect(combineQuery(' ', ' ')).toBe('');
  });

  it('restores the split only while q still matches it', () => {
    rememberSearchSplit({ what: 'jazz', where: 'Hà Nội' });
    expect(splitQuery('jazz Hà Nội')).toEqual({ what: 'jazz', where: 'Hà Nội' });
    expect(splitQuery('rock')).toEqual({ what: 'rock', where: '' });
  });

  it('keeps five distinct recent searches, newest first', () => {
    for (const what of ['a', 'b', 'c', 'd', 'e', 'f']) addRecentSearch({ what, where: '' });
    addRecentSearch({ what: 'C', where: '' });
    expect(readRecentSearches().map((entry) => entry.what)).toEqual(['C', 'f', 'e', 'd', 'b']);
    expect(recentSearchLabel({ what: 'jazz', where: 'Huế' })).toBe('jazz · Huế');
    clearRecentSearches();
    expect(readRecentSearches()).toEqual([]);
  });

  it('ignores malformed stored searches', () => {
    localStorage.setItem('ticketbox.recent-searches', '{"broken":');
    expect(readRecentSearches()).toEqual([]);
    localStorage.setItem(
      'ticketbox.recent-searches',
      JSON.stringify([{ what: 1 }, { what: 'ok', where: '' }]),
    );
    expect(readRecentSearches()).toEqual([{ what: 'ok', where: '' }]);
  });

  it('groups events once per event and venues that match the query', () => {
    const suggestions = buildSuggestions(
      [
        item({ id: 'show-1', eventId: 'event-1' }),
        item({ id: 'show-2', eventId: 'event-1', venueName: 'Hanoi Arena' }),
        item({ id: 'legacy-1', title: 'Opera Gala', venueName: 'Saigon Opera House' }),
      ],
      'ha noi',
    );
    expect(suggestions.events).toEqual([
      expect.objectContaining({ id: 'event-1', href: '/events/event-1?performance=show-1' }),
      expect.objectContaining({ id: 'legacy-1', href: '/concerts/legacy-1' }),
    ]);
    // Like Catalog, every word must appear in the venue name.
    expect(suggestions.venues).toEqual(['Nhà hát Lớn Hà Nội', 'Hanoi Arena']);
  });
});
