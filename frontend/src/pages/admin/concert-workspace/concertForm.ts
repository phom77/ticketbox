import type { ConcertMutation } from '../../../api/admin';
import type { ConcertDetail } from '../../../api/concerts';
import { editConcertText } from '../../../features/concert/concertText';

function toLocalInput(value: string | null) {
  if (!value) return '';
  const date = new Date(value);
  return new Date(date.getTime() - date.getTimezoneOffset() * 60_000).toISOString().slice(0, 16);
}

export function toForm(concert: ConcertDetail): ConcertMutation {
  return {
    title: concert.title,
    description: concert.description,
    ...editConcertText(concert),
    venueName: concert.venueName,
    venueAddress: concert.venueAddress,
    eventDate: toLocalInput(concert.eventDate),
    doorsOpenAt: toLocalInput(concert.doorsOpenAt),
    saleStartAt: toLocalInput(concert.saleStartAt),
    saleEndAt: toLocalInput(concert.saleEndAt),
    seatMapSvg: concert.seatMapSvg,
  };
}

export function toPayload(form: ConcertMutation): ConcertMutation {
  const toIso = (value: string | null) => (value ? new Date(value).toISOString() : null);
  return {
    ...form,
    title: form.title.trim(),
    venueName: form.venueName.trim(),
    venueAddress: form.venueAddress.trim(),
    description: form.description?.trim() || null,
    eventDate: toIso(form.eventDate)!,
    doorsOpenAt: toIso(form.doorsOpenAt),
    saleStartAt: toIso(form.saleStartAt)!,
    saleEndAt: toIso(form.saleEndAt),
  };
}
