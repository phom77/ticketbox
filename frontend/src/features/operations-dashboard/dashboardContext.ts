import { dateFormatter } from '../../data/formatters';

export const dashboardTime = dateFormatter({
  dateStyle: 'medium',
  timeStyle: 'short',
  timeZone: 'Asia/Ho_Chi_Minh',
});

export function dashboardConcertPath(
  scope: 'admin' | 'organizer',
  eventId: string,
  legacyConcertId?: string | null,
  performanceId?: string | null,
  step?: 'review',
) {
  if (legacyConcertId) return `/${scope}/concerts/${encodeURIComponent(legacyConcertId)}`;
  const params = new URLSearchParams();
  if (performanceId) params.set('show', performanceId);
  if (step) params.set('step', step);
  return `/${scope}/events/${encodeURIComponent(eventId)}${params.size ? '?' + params : ''}`;
}
