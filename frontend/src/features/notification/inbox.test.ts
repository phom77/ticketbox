import { describe, expect, it } from 'vitest';
import type { NotificationItem } from '../../api/notifications';
import { groupByDay, notificationDestination } from './inbox';

const at = (createdAt: string) => ({ id: createdAt, createdAt }) as NotificationItem;

describe('notification inbox helpers', () => {
  it('splits today from earlier', () => {
    const now = new Date(2026, 10, 24, 15);
    const groups = groupByDay(
      [at(new Date(2026, 10, 24, 1).toISOString()), at(new Date(2026, 10, 23, 23).toISOString())],
      now,
    );
    expect(groups.today).toHaveLength(1);
    expect(groups.earlier).toHaveLength(1);
  });

  it('gives postponed events a destination', () => {
    expect(notificationDestination('EVENT_POSTPONED')?.to).toBe('/my-tickets');
    expect(notificationDestination('TICKET_TRANSFER_OFFERED')?.to).toBe('/my-tickets');
    expect(notificationDestination('TICKET_TRANSFER_EXPIRED')?.to).toBe('/my-tickets');
    expect(notificationDestination('UNKNOWN')).toBeNull();
  });
});
