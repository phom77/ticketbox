import type { ConcertDetail, ConcertText, ConcertTranslations } from '../../api/concerts';
import { currentLanguage } from '../../i18n';

export function concertTitle(concert: { title: string; translations?: ConcertTranslations }, language = currentLanguage()) {
  return concert.translations?.[language]?.title || concert.title;
}

export function concertDescription(concert: ConcertDetail, language = currentLanguage()) {
  return concert.translations?.[language]?.description || concert.description;
}

export function editConcertText(concert: ConcertDetail) {
  const original = concert.original === undefined
    ? { title: concert.title, description: concert.description }
    : concert.original;
  return { original, translations: concert.translations ?? {} };
}

export const emptyConcertText: ConcertText = { title: null, description: null };
