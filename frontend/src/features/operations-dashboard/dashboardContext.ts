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
  // Organizers open a legacy concert in the event workspace (its event id is the concert id).
  if (legacyConcertId && scope === 'admin')
    return `/admin/concerts/${encodeURIComponent(legacyConcertId)}`;
  const params = new URLSearchParams();
  if (performanceId) params.set('show', performanceId);
  if (step) params.set('step', step);
  return `/${scope}/events/${encodeURIComponent(eventId)}${params.size ? '?' + params : ''}`;
}
