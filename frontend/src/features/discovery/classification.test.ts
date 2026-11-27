import { describe, expect, it } from 'vitest';
// The migration is the source of the ids; Vite reads it as text.
import migration from '../../../../services/catalog/src/main/resources/db/migration/V22__event_classification.sql?raw';
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
  it('match the segments and genres Catalog seeds in V22', () => {
    const segments = [...migration.matchAll(/^\s+\('([a-z0-9-]+)', (\d+)\)[,;]$/gm)].map(
      (m) => m[1],
    );
    const genres = [
      ...migration.matchAll(/^\s+\('([a-z0-9-]+)', '([a-z0-9-]+)', (\d+), (TRUE|FALSE)\)[,;]$/gm),
    ].map((m) => ({ id: m[1], segment: m[2], popular: m[4] === 'TRUE' }));
    expect(classificationSegments.map((segment) => segment.id)).toEqual(segments);
    expect(
      classificationSegments.flatMap((segment) =>
        segment.genres.map((genre) => ({
          id: genre.id,
          segment: segment.id,
          popular: genre.popular,
        })),
      ),
    ).toEqual(genres);
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
