import { concertTimeZone } from '../discovery/filters';
import { formatLanguage } from '../../i18n';
import type { DateSaleState } from './eventDetail';

export const stateLabels: Record<DateSaleState, string> = {
  'on-sale': 'state_onSale',
  'waiting-room': 'state_waitingRoom',
  upcoming: 'state_upcomingShort',
  'sold-out': 'state_soldOut',
  cancelled: 'state_cancelled',
  paused: 'state_paused',
  closed: 'state_closed',
};

export function formatInZone(
  value: string,
  timezone: string | null,
  kind: 'day' | 'time' | 'full',
) {
  const zone = timezone ?? concertTimeZone;
  const options: Intl.DateTimeFormatOptions =
    kind === 'day'
      ? { weekday: 'short', day: 'numeric', month: 'short', timeZone: zone }
      : kind === 'time'
        ? { hour: 'numeric', minute: '2-digit', timeZone: zone }
        : {
            weekday: 'short',
            day: 'numeric',
            month: 'short',
            year: 'numeric',
            hour: 'numeric',
            minute: '2-digit',
            timeZone: zone,
          };
  return new Intl.DateTimeFormat(formatLanguage(), options).format(new Date(value));
}
const palette = [
  '#2b6cb0',
  '#c05621',
  '#2f855a',
  '#b83280',
  '#6b46c1',
  '#b7791f',
  '#0f766e',
  '#c53030',
];
export function zoneColor(label: string) {
  let hash = 0;
  for (const char of label) hash = (hash * 31 + char.charCodeAt(0)) >>> 0;
  return palette[hash % palette.length];
}
