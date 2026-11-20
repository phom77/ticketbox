import type { Performance } from '../../api/performances';
import { formatLanguage } from '../../i18n';

export function performanceTime(performance: Performance) {
  return new Intl.DateTimeFormat(formatLanguage(), {
    dateStyle: 'full', timeStyle: 'short', timeZone: performance.timezone,
  }).format(new Date(performance.startsAt));
}
