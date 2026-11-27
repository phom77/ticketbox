import { describe, expect, it } from 'vitest';
// contracts/classification-ids.json is the shared list of ids; Catalog tests it against its reference rows.
// Loaded with import.meta.glob so the web image, built from frontend/ only, still type-checks without the file.
const contracts = import.meta.glob<{
  segments: { id: string; genres: { id: string; popular: boolean }[] }[];
}>('../../../../contracts/classification-ids.json', { eager: true, import: 'default' });
const contract = Object.values(contracts)[0];
import {
  aliasForCategory,
  classificationSegments,
  classificationText,
  genreLabelKey,
  headerSegmentIds,
  matchGenres,
  primaryLabel,
  segmentGenres,
  segmentLabelKey,
} from './classification';

describe('classification ids', () => {
  it('match the shared id list Catalog verifies against its reference data', () => {
    expect(contract).toBeDefined();
    expect(
      classificationSegments.map((segment) => ({
        id: segment.id,
        genres: segment.genres.map((genre) => ({ id: genre.id, popular: genre.popular })),
      })),
    ).toEqual(contract?.segments);
  });

  it('keeps genre ids unique and lists every segment but Other in the header', () => {
    const ids = classificationSegments.flatMap((segment) =>
      segment.genres.map((genre) => genre.id),
    );
    expect(new Set(ids).size).toBe(ids.length);
    expect(headerSegmentIds).toEqual([
      'concerts',
      'festivals',
      'sports',
      'arts-theater-comedy',
      'family',
    ]);
  });
});

describe('labels', () => {
  const translate = (key: string) => `t:${key}`;

  it('builds camel-case catalog keys', () => {
    expect(segmentLabelKey('arts-theater-comedy')).toBe('shared:segment_artsTheaterComedy');
    expect(genreLabelKey('rap-hip-hop')).toBe('shared:genre_rapHipHop');
  });

  it('translates known ids, shows unknown ones as plain words and prefers the genre', () => {
    expect(classificationText('vpop', 'genre', translate)).toBe('t:shared:genre_vpop');
    expect(classificationText('street_food', 'genre', translate)).toBe('street food');
    expect(classificationText('other', 'segment', translate)).toBe('t:shared:segment_others');
    expect(genreLabelKey('other')).toBe('shared:genre_others');
    expect(primaryLabel({ segment: 'concerts', primaryGenre: 'rock' }, translate)).toBe(
      't:shared:genre_rock',
    );
    expect(primaryLabel({ segment: 'concerts' }, translate)).toBe('t:shared:segment_concerts');
    expect(primaryLabel({}, translate)).toBe('');
  });

  it('lists popular genres first and filters by label without marks', () => {
    const concerts = classificationSegments[0];
    const ordered = segmentGenres(concerts).map((genre) => genre.id);
    expect(ordered.slice(0, 6)).toEqual(['vpop', 'indie', 'rap-hip-hop', 'edm', 'rock', 'bolero']);
    const label = (id: string) => (id === 'bolero' ? 'Bolero & Trữ tình' : id);
    expect(matchGenres(concerts.genres, 'tru tinh', label).map((genre) => genre.id)).toEqual([
      'bolero',
    ]);
    expect(matchGenres(concerts.genres, '  ', label)).toHaveLength(concerts.genres.length);
  });
});

describe('old categories', () => {
  it('map onto segments, and comedy onto the stand-up genre', () => {
    expect(aliasForCategory('arts-theater')).toEqual({ segment: 'arts-theater-comedy' });
    expect(aliasForCategory(' Comedy ')).toEqual({
      segment: 'arts-theater-comedy',
      genre: 'stand-up',
    });
    expect(aliasForCategory('jazz')).toBeNull();
  });
});
