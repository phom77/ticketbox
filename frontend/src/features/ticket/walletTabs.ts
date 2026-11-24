import type { TicketStatus } from '../../api/tickets';

export const ticketStatusKeys = {
  VALID: 'customer:myTicketsPage_hopLe',
  USED: 'customer:myTicketsPage_daDung',
  CANCELLED: 'customer:myTicketsPage_daHuy',
  TRANSFERRED: 'customer:myTicketsPage_daChuyen',
} satisfies Record<TicketStatus, string>;

/** An event is upcoming while it has not started and a ticket can still be used. */
export function isUpcomingEvent(startsAt: number | null, statuses: readonly string[], now: number) {
  if (!statuses.includes('VALID')) return false;
  return startsAt === null || startsAt >= now;
}
