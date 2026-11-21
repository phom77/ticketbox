import type { ConcertSummary } from '../../api/concerts';

export const waitingRoomLeadMs = 60 * 60 * 1_000;

export function concertSaleState(
  concert: Pick<ConcertSummary, 'status' | 'saleStartAt' | 'saleEndAt'>,
  now: number,
) {
  const saleStart = Date.parse(concert.saleStartAt);
  const saleEnd = concert.saleEndAt ? Date.parse(concert.saleEndAt) : null;

  if (concert.status === 'CANCELLED') return 'cancelled';
  if (concert.status === 'COMPLETED' || (saleEnd !== null && saleEnd <= now)) return 'closed';
  if (concert.status === 'SOLD_OUT') return 'sold-out';
  if (concert.status !== 'ON_SALE' || !Number.isFinite(saleStart) || saleStart - waitingRoomLeadMs > now) return 'upcoming';
  return saleStart > now ? 'waiting-room' : 'on-sale';
}

export type ConcertSaleState = ReturnType<typeof concertSaleState>;

export const eventSaleLabels = {
  'on-sale': 'discovery_onSale',
  'sold-out': 'discovery_soldOut',
  upcoming: 'discovery_comingSoon',
  'waiting-room': 'discovery_waitingRoom',
  closed: 'discovery_salesEnded',
  cancelled: 'discovery_cancelled',
} as const;
