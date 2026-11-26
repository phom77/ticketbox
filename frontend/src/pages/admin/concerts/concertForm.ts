import type { ConcertMutation } from '../../../api/admin';
import type { ConcertDetail } from '../../../api/concerts';
import { editConcertText } from '../../../features/concert/concertText';

export type ConcertFormState = {
  original?: ConcertMutation['original'];
  translations: NonNullable<ConcertMutation['translations']>;
  venueName: string;
  venueAddress: string;
  eventDate: string;
  doorsOpenAt: string;
  saleStartAt: string;
  saleEndAt: string;
  seatMapSvg: string;
  /** A category id from `eventCategories`, or empty for none. */
  category: string;
};

export const emptyForm: ConcertFormState = {
  translations: {},
  venueName: '',
  venueAddress: '',
  eventDate: '',
  doorsOpenAt: '',
  saleStartAt: '',
  saleEndAt: '',
  seatMapSvg: '',
  category: '',
};

function toLocalInput(value: string | null) {
  if (!value) return '';
  const date = new Date(value);
  const offset = date.getTimezoneOffset() * 60_000;
  return new Date(date.getTime() - offset).toISOString().slice(0, 16);
}

export function formFromConcert(concert: ConcertDetail): ConcertFormState {
  return {
    ...editConcertText(concert),
    venueName: concert.venueName,
    venueAddress: concert.venueAddress,
    eventDate: toLocalInput(concert.eventDate),
    doorsOpenAt: toLocalInput(concert.doorsOpenAt),
    saleStartAt: toLocalInput(concert.saleStartAt),
    saleEndAt: toLocalInput(concert.saleEndAt),
    seatMapSvg: concert.seatMapSvg ?? '',
    category: '',
  };
}

export function toPayload(form: ConcertFormState): ConcertMutation {
  return {
    title: '',
    description: null,
    original: form.original,
    translations: form.translations,
    venueName: form.venueName.trim(),
    venueAddress: form.venueAddress.trim(),
    eventDate: new Date(form.eventDate).toISOString(),
    doorsOpenAt: form.doorsOpenAt ? new Date(form.doorsOpenAt).toISOString() : null,
    saleStartAt: new Date(form.saleStartAt).toISOString(),
    saleEndAt: form.saleEndAt ? new Date(form.saleEndAt).toISOString() : null,
    seatMapSvg: form.seatMapSvg.trim() || null,
  };
}
