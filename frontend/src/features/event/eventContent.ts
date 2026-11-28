import type { ConcertTranslations } from '../../api/concerts';
import type { EventContentValue, RevisionInput, RevisionState } from '../../api/eventContent';
import type { EventContentInput } from '../../api/performanceManagement';
import type { AgeRating } from '../../api/performances';

export const ageRatings: AgeRating[] = ['ALL', '13+', '16+', '18+'];

export const posterMaxBytes = 5 * 1024 * 1024;
const posterTypes = ['image/jpeg', 'image/png', 'image/webp'];
export const refundPolicyLimit = 2_000;
export const artistBioLimit = 20_000;

/** The details step as the organizer edits it. */
export type ContentForm = {
  title: string;
  description: string;
  segment: string;
  primaryGenre: string;
  /** Secondary genres (tags), at most three. */
  genres: string[];
  translations: ConcertTranslations;
  artistBio: string;
  ageRating: AgeRating | '';
  refundPolicy: string;
};

export const maxGenreTags = 3;

/** The classification the server sends for an event or, in a revision, inside its content. */
export type ClassificationValue = {
  segment?: string | null;
  primaryGenre?: string | null;
  genres?: string[] | null;
  secondaryGenres?: string[] | null;
};

type ContentSource = {
  title: string;
  description?: string | null;
  segment?: string | null;
  primaryGenre?: string | null;
  genres?: string[] | null;
  /** Revision content carries the classification as one object. */
  classification?: ClassificationValue | null;
  translations?: ConcertTranslations;
  artistBio?: string | null;
  ageRating?: AgeRating | null;
  refundPolicy?: string | null;
};

export const emptyForm: ContentForm = {
  title: '',
  description: '',
  segment: '',
  primaryGenre: '',
  genres: [],
  translations: {},
  artistBio: '',
  ageRating: '',
  refundPolicy: '',
};

/** The classification of a source: a revision's own when it has one, otherwise the live event's. */
export function classificationOf(source: ContentSource, fallback?: ContentSource) {
  const value = source.classification ?? (source.segment !== undefined ? source : null);
  const from = value ?? fallback?.classification ?? fallback ?? null;
  const tags = from?.genres ?? (from as ClassificationValue | null)?.secondaryGenres ?? [];
  return {
    segment: (from?.segment ?? '').trim().toLowerCase(),
    primaryGenre: (from?.primaryGenre ?? '').trim().toLowerCase(),
    genres: [...tags],
  };
}

/** `live` supplies the classification of a revision that predates classification. */
export function formFromContent(source: ContentSource, live?: ContentSource): ContentForm {
  return {
    title: source.title,
    description: source.description ?? '',
    ...classificationOf(source, live),
    translations: cleanTranslations(source.translations),
    artistBio: source.artistBio ?? '',
    ageRating: source.ageRating ?? '',
    refundPolicy: source.refundPolicy ?? '',
  };
}

/** Drops languages without any text so an untouched language is not saved as empty. */
export function cleanTranslations(translations: ConcertTranslations | undefined) {
  const result: ConcertTranslations = {};
  for (const [language, text] of Object.entries(translations ?? {})) {
    const title = text?.title?.trim() || null;
    const description = text?.description?.trim() || null;
    if (title || description) result[language] = { title, description };
  }
  return result;
}

export function contentInput(form: ContentForm): EventContentInput {
  return {
    title: form.title.trim(),
    description: form.description.trim(),
    translations: cleanTranslations(form.translations),
    artistBio: form.artistBio.trim(),
    ageRating: form.ageRating || null,
    refundPolicy: form.refundPolicy.trim(),
  };
}

/** The classification fields of the event write; empty strings mean "none chosen". */
export function classificationInput(form: ContentForm) {
  return { segment: form.segment, primaryGenre: form.primaryGenre, genres: form.genres };
}

export function revisionInput(form: ContentForm): RevisionInput {
  const { title, description, translations, artistBio, ageRating, refundPolicy } =
    contentInput(form);
  return {
    title,
    description,
    translations,
    artistBio,
    ageRating,
    refundPolicy,
    ...classificationInput(form),
  };
}

export function sameContent(a: ContentForm, b: ContentForm) {
  return (
    JSON.stringify(contentInput(a)) + JSON.stringify(classificationInput(a)) ===
    JSON.stringify(contentInput(b)) + JSON.stringify(classificationInput(b))
  );
}

/** One line of the side-by-side review: the live text, the proposed text and whether they differ. */
export type ContentDifference = {
  field:
    | 'title'
    | 'description'
    | 'translationVi'
    | 'translationEn'
    | 'artistBio'
    | 'ageRating'
    | 'refundPolicy'
    | 'classification'
    | 'poster';
  current: string;
  proposed: string;
  changed: boolean;
};

const text = (value: string | null | undefined) => (value ?? '').trim();

/**
 * `describe` turns a classification into words (segment, genre and tags); without it ids are shown. The classification
 * line compares ids, so a relabelling never looks like a change.
 */
export function contentDifferences(
  live: ContentSource & { posterUrl?: string | null },
  revision: { content: EventContentValue; posterUrl: string | null; posterChanged: boolean },
  describe: (classification: ReturnType<typeof classificationOf>) => string = (value) =>
    [value.segment, value.primaryGenre, ...value.genres].filter(Boolean).join(' / '),
): ContentDifference[] {
  const translation = (language: 'vi' | 'en') => {
    const side = (source: ConcertTranslations | undefined) =>
      [source?.[language]?.title, source?.[language]?.description]
        .map((value) => text(value))
        .filter(Boolean)
        .join('\n');
    return [side(live.translations), side(revision.content.translations)] as const;
  };
  const line = (field: ContentDifference['field'], current: string, proposed: string) => ({
    field,
    current,
    proposed,
    changed: current !== proposed,
  });
  const [viCurrent, viProposed] = translation('vi');
  const [enCurrent, enProposed] = translation('en');
  const content = revision.content;
  return [
    line('title', text(live.title), text(content.title)),
    line('description', text(live.description), text(content.description)),
    line('translationVi', viCurrent, viProposed),
    line('translationEn', enCurrent, enProposed),
    line('artistBio', text(live.artistBio), text(content.artistBio)),
    line('ageRating', live.ageRating ?? '', content.ageRating ?? ''),
    line('refundPolicy', text(live.refundPolicy), text(content.refundPolicy)),
    classificationLine(live, revision.content, describe),
    line(
      'poster',
      live.posterUrl ?? '',
      revision.posterChanged ? (revision.posterUrl ?? '') : (live.posterUrl ?? ''),
    ),
  ];
}

function classificationLine(
  live: ContentSource,
  proposed: EventContentValue,
  describe: (classification: ReturnType<typeof classificationOf>) => string,
): ContentDifference {
  const current = classificationOf(live);
  // A revision staged before classification existed has none and keeps the live one.
  const next = proposed.classification ? classificationOf(proposed) : current;
  return {
    field: 'classification',
    current: describe(current),
    proposed: describe(next),
    changed: JSON.stringify(current) !== JSON.stringify(next),
  };
}

/** A specific problem with a poster file, or null when it can be uploaded. */
export function posterProblem(file: File): 'type' | 'size' | null {
  if (!posterTypes.includes(file.type)) return 'type';
  if (file.size > posterMaxBytes) return 'size';
  return null;
}

/** Whether the revision still holds text that differs from, or waits to replace, the live version. */
export function openRevision(state: RevisionState | undefined | null) {
  return Boolean(state) && state !== 'APPROVED';
}

export function revisionLabelKey(state: RevisionState) {
  switch (state) {
    case 'DRAFTING':
      return 'event-content:statusDrafting';
    case 'SUBMITTED':
      return 'event-content:statusSubmitted';
    case 'CHANGES_REQUESTED':
      return 'event-content:statusChangesRequested';
    case 'REJECTED':
      return 'event-content:statusRejected';
    case 'APPROVED':
      return 'event-content:statusApproved';
  }
}

export function revisionHelpKey(state: RevisionState) {
  switch (state) {
    case 'DRAFTING':
      return 'event-content:statusHelpDrafting';
    case 'SUBMITTED':
      return 'event-content:statusHelpSubmitted';
    case 'CHANGES_REQUESTED':
      return 'event-content:statusHelpChangesRequested';
    case 'REJECTED':
      return 'event-content:statusHelpRejected';
    case 'APPROVED':
      return 'event-content:statusHelpApproved';
  }
}

export function ageRatingLabelKey(rating: AgeRating) {
  switch (rating) {
    case 'ALL':
      return 'event-content:ageAll';
    case '13+':
      return 'event-content:age13';
    case '16+':
      return 'event-content:age16';
    case '18+':
      return 'event-content:age18';
  }
}
