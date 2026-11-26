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
  category: string;
  translations: ConcertTranslations;
  artistBio: string;
  ageRating: AgeRating | '';
  refundPolicy: string;
};

type ContentSource = {
  title: string;
  description?: string | null;
  category?: string | null;
  translations?: ConcertTranslations;
  artistBio?: string | null;
  ageRating?: AgeRating | null;
  refundPolicy?: string | null;
};

export const emptyForm: ContentForm = {
  title: '',
  description: '',
  category: '',
  translations: {},
  artistBio: '',
  ageRating: '',
  refundPolicy: '',
};

export function formFromContent(source: ContentSource, category = source.category): ContentForm {
  return {
    title: source.title,
    description: source.description ?? '',
    category: (category ?? '').trim().toLowerCase(),
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

export function revisionInput(form: ContentForm): RevisionInput {
  const { title, description, translations, artistBio, ageRating, refundPolicy } =
    contentInput(form);
  return { title, description, translations, artistBio, ageRating, refundPolicy };
}

export function sameContent(a: ContentForm, b: ContentForm) {
  return (
    JSON.stringify(contentInput(a)) + a.category === JSON.stringify(contentInput(b)) + b.category
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
    | 'poster';
  current: string;
  proposed: string;
  changed: boolean;
};

const text = (value: string | null | undefined) => (value ?? '').trim();

export function contentDifferences(
  live: ContentSource & { posterUrl?: string | null },
  revision: { content: EventContentValue; posterUrl: string | null; posterChanged: boolean },
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
    line(
      'poster',
      live.posterUrl ?? '',
      revision.posterChanged ? (revision.posterUrl ?? '') : (live.posterUrl ?? ''),
    ),
  ];
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
