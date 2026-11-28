import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ManagedPerformance, Venue } from '../../api/performanceManagement';
import { PerformanceScheduleForm } from './PerformanceScheduleForm';

const api = vi.hoisted(() => ({ updatePerformanceSchedule: vi.fn(), createPerformance: vi.fn() }));
vi.mock('../../api/performanceManagement', async (original) => ({
  ...(await original<typeof import('../../api/performanceManagement')>()),
  updatePerformanceSchedule: api.updatePerformanceSchedule,
  createPerformance: api.createPerformance,
}));

const performance = {
  id: 'p1',
  eventId: 'e1',
  venueSpaceId: 's1',
  venueName: 'Room',
  timezone: 'Asia/Ho_Chi_Minh',
  startsAt: '2030-03-05T12:00:00.000Z',
  endsAt: '2030-03-05T14:00:00.000Z',
  doorsOpenAt: null,
  saleStartAt: '2030-01-01T03:00:00.000Z',
  saleEndAt: '2030-03-05T11:00:00.000Z',
  maxPerAccount: 4,
  publicVisible: true,
  draftVersion: 2,
  status: 'DRAFT',
} as unknown as ManagedPerformance;
const venue: Venue = {
  id: 'v1',
  name: 'Room',
  address: '1 Street',
  city: null,
  timezone: 'Asia/Ho_Chi_Minh',
  capacityHint: null,
  version: 1,
  spaces: [{ id: 's1', name: 'Stage' }],
};

describe('PerformanceScheduleForm', () => {
  beforeEach(() => {
    api.updatePerformanceSchedule.mockReset().mockResolvedValue(performance);
  });

  it('saves a new start for an existing performance', async () => {
    const user = userEvent.setup();
    render(
      <PerformanceScheduleForm
        eventId="e1"
        performance={performance}
        venues={[venue]}
        venueLoadError=""
        onReload={vi.fn()}
        onRetryVenues={vi.fn()}
        onVenueCreated={vi.fn()}
        onSave={vi.fn()}
        onDirtyChange={vi.fn()}
        onBusyChange={vi.fn()}
      />,
    );
    for (const label of ['Show starts, date', 'Show ends, date']) {
      const field = screen.getByLabelText(label);
      await user.clear(field);
      await user.type(field, '03/06/2030');
    }
    await user.click(screen.getByRole('button', { name: /Save and continue/ }));
    await waitFor(() => expect(api.updatePerformanceSchedule).toHaveBeenCalled());
    const body = api.updatePerformanceSchedule.mock.calls[0][2];
    expect(body.startsAt).toMatch(/^2030-03-06T12:00/);
    expect(body.endsAt).toMatch(/^2030-03-06T14:00/);
  });
});
