import { normaliseSearch } from './headerSearch';

export type ClassificationGenre = { id: string; popular: boolean };
export type ClassificationSegment = { id: string; genres: ClassificationGenre[] };

/**
 * The segments and genres Catalog ships, in display order. Catalog (migration V22) owns the list and serves the active
 * rows from GET /api/v2/classifications; this copy gives the labels, the fallback while that request is pending, and
 * a test pins its ids to the migration.
 */
export const classificationSegments: ClassificationSegment[] = [
  {
    id: 'concerts',
    genres: [
      { id: 'vpop', popular: true },
      { id: 'indie', popular: true },
      { id: 'rap-hip-hop', popular: true },
      { id: 'edm', popular: true },
      { id: 'rock', popular: true },
      { id: 'bolero', popular: true },
      { id: 'ballad', popular: false },
      { id: 'jazz', popular: false },
      { id: 'classical', popular: false },
      { id: 'kpop', popular: false },
      { id: 'international-pop', popular: false },
      { id: 'rnb-soul', popular: false },
      { id: 'acoustic', popular: false },
      { id: 'traditional-music', popular: false },
      { id: 'music-other', popular: false },
    ],
  },
  {
    id: 'festivals',
    genres: [
      { id: 'music-festival', popular: true },
      { id: 'cultural-festival', popular: true },
      { id: 'food-festival', popular: true },
      { id: 'film-festival', popular: false },
      { id: 'art-festival', popular: false },
      { id: 'festival-other', popular: false },
    ],
  },
  {
    id: 'sports',
    genres: [
      { id: 'football', popular: true },
      { id: 'esports', popular: true },
      { id: 'running', popular: true },
      { id: 'combat-sports', popular: true },
      { id: 'basketball', popular: false },
      { id: 'volleyball', popular: false },
      { id: 'tennis-badminton', popular: false },
      { id: 'motorsport', popular: false },
      { id: 'sports-other', popular: false },
    ],
  },
  {
    id: 'arts-theater-comedy',
    genres: [
      { id: 'theater', popular: true },
      { id: 'stand-up', popular: true },
      { id: 'musical', popular: true },
      { id: 'dance', popular: true },
      { id: 'cai-luong', popular: true },
      { id: 'cheo-tuong', popular: false },
      { id: 'water-puppetry', popular: false },
      { id: 'opera', popular: false },
      { id: 'comedy-show', popular: false },
      { id: 'exhibition', popular: false },
      { id: 'arts-other', popular: false },
    ],
  },
  {
    id: 'family',
    genres: [
      { id: 'kids-show', popular: true },
      { id: 'circus-magic', popular: true },
      { id: 'family-concert', popular: true },
      { id: 'workshop-kids', popular: false },
      { id: 'family-other', popular: false },
    ],
  },
  {
    id: 'other',
    genres: [
      { id: 'talk-conference', popular: true },
      { id: 'workshop', popular: true },
      { id: 'meetup', popular: false },
      { id: 'other', popular: false },
    ],
  },
];

const genreIndex = new Map(
  classificationSegments.flatMap((segment) =>
    segment.genres.map((genre) => [genre.id, { ...genre, segmentId: segment.id }] as const),
  ),
);

export const segmentIds = classificationSegments.map((segment) => segment.id);

/** The browse links of the buyer header: every segment except Other, which lives in the filters. */
export const headerSegmentIds = segmentIds.filter((id) => id !== 'other');

const camel = (id: string) =>
  id.replace(/-([a-z0-9])/g, (_, letter: string) => letter.toUpperCase());

// "other" is a plural-form suffix in i18next (`key_other`), so the catch-all ids use `others` in the catalogs.
const labelId = (id: string) => (id === 'other' ? 'others' : camel(id));

export const segmentLabelKey = (id: string) => `shared:segment_${labelId(id)}`;
export const genreLabelKey = (id: string) => `shared:genre_${labelId(id)}`;

export const isSegmentId = (id: string) => segmentIds.includes(id);
export const segmentOfGenre = (id: string) => genreIndex.get(id)?.segmentId ?? null;
export const isGenreId = (id: string) => genreIndex.has(id);

/** The label to show for an id: translated when it is known, otherwise the id as plain words. */
export function classificationText(
  id: string,
  kind: 'segment' | 'genre',
  translate: (key: string) => string,
) {
  const known = kind === 'segment' ? isSegmentId(id) : isGenreId(id);
  if (known) return translate(kind === 'segment' ? segmentLabelKey(id) : genreLabelKey(id));
  return id.replace(/[_-]/g, ' ');
}

/** The genre a card or event page shows: the primary genre, or the segment when there is none. */
export function primaryLabel(
  classification: { segment?: string | null; primaryGenre?: string | null },
  translate: (key: string) => string,
) {
  if (classification.primaryGenre) {
    return classificationText(classification.primaryGenre, 'genre', translate);
  }
  return classification.segment
    ? classificationText(classification.segment, 'segment', translate)
    : '';
}

/**
 * Old category ids and the segment (and genre) each one became. Links and bookmarks that still carry `category` are
 * rewritten with this map for one release.
 */
export const legacyCategoryAlias: Record<string, { segment: string; genre?: string }> = {
  concerts: { segment: 'concerts' },
  festivals: { segment: 'festivals' },
  sports: { segment: 'sports' },
  'arts-theater': { segment: 'arts-theater-comedy' },
  comedy: { segment: 'arts-theater-comedy', genre: 'stand-up' },
  family: { segment: 'family' },
};

export function aliasForCategory(category: string) {
  return legacyCategoryAlias[category.trim().toLowerCase()] ?? null;
}

/** Genres of a segment with the popular ones first, keeping the display order inside each group. */
export function segmentGenres(segment: ClassificationSegment) {
  return [...segment.genres].sort((a, b) => Number(b.popular) - Number(a.popular));
}

/** Filters the genres of a segment by what the user typed, ignoring case and Vietnamese marks. */
export function matchGenres(
  genres: ClassificationGenre[],
  text: string,
  label: (id: string) => string,
) {
  const wanted = normaliseSearch(text);
  if (!wanted) return genres;
  return genres.filter((genre) => normaliseSearch(label(genre.id)).includes(wanted));
}

/** "Concerts · V-Pop · Indie, Rock": segment, primary genre and tags in words, for summaries and comparisons. */
export function describeClassification(
  classification: { segment: string; primaryGenre: string; genres: string[] },
  translate: (key: string) => string,
) {
  const tags = classification.genres
    .map((id) => classificationText(id, 'genre', translate))
    .join(', ');
  return [
    classification.segment ? classificationText(classification.segment, 'segment', translate) : '',
    classification.primaryGenre
      ? classificationText(classification.primaryGenre, 'genre', translate)
      : '',
    tags,
  ]
    .filter(Boolean)
    .join(' · ');
}
