import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ToastProvider } from '../../../components/feedback/ToastProvider';
import { ApiClientError } from '../../../api/client';
import type { ManagedPerformance, Venue } from '../../../api/performanceManagement';
import type { QueuedRequest, SalesState } from '../../../api/performanceScheduling';
import { DisruptionRequestsPanel } from '../../admin/DisruptionRequestsPanel';
import { AddDatesDialog } from './AddDatesDialog';
import { ApplyPricingDialog } from './ApplyPricingDialog';
import { DuplicateDialog } from './DuplicateDialog';
import { PerformanceSalesPanel } from './PerformanceSalesPanel';
import { VenueLibraryDialog } from './VenueLibraryDialog';

const scheduling = vi.hoisted(() => ({
  addPerformanceDates: vi.fn(),
  duplicatePerformance: vi.fn(),
  applyPricing: vi.fn(),
  updateVenue: vi.fn(),
  addVenueSpace: vi.fn(),
  renameVenueSpace: vi.fn(),
  getSalesState: vi.fn(),
  pauseSales: vi.fn(),
  resumeSales: vi.fn(),
  requestDisruption: vi.fn(),
  withdrawDisruptionRequest: vi.fn(),
  listDisruptionRequests: vi.fn(),
  declineDisruptionRequest: vi.fn(),
}));
const management = vi.hoisted(() => ({ createVenue: vi.fn() }));
vi.mock('../../../api/performanceScheduling', () => scheduling);
vi.mock('../../../api/performanceManagement', async (original) => ({
  ...(await original<typeof import('../../../api/performanceManagement')>()),
  createVenue: management.createVenue,
}));

const performance = {
  id: 'p1',
  eventId: 'e1',
  venueSpaceId: 's1',
  venueName: 'Room',
  timezone: 'Asia/Ho_Chi_Minh',
  startsAt: '2030-03-05T12:00:00.000Z',
  endsAt: '2030-03-05T14:00:00.000Z',
  saleStartAt: '2030-01-01T03:00:00.000Z',
  saleEndAt: '2030-03-05T11:00:00.000Z',
  saleVersion: 3,
  status: 'DRAFT',
} as unknown as ManagedPerformance;
const other = { ...performance, id: 'p2', startsAt: '2030-04-05T12:00:00.000Z' };
const venue: Venue = {
  id: 'v1',
  name: 'Room',
  address: '1 Street',
  city: 'Da Nang',
  timezone: 'Asia/Ho_Chi_Minh',
  capacityHint: 800,
  version: 2,
  spaces: [{ id: 's1', name: 'Stage' }],
};

function wrap(children: React.ReactNode) {
  return (
    <MemoryRouter>
      <ToastProvider>{children}</ToastProvider>
    </MemoryRouter>
  );
}

beforeEach(() => vi.clearAllMocks());

describe('AddDatesDialog', () => {
  it('requires a day, then adds every chosen day in one request copying the source', async () => {
    const user = userEvent.setup();
    scheduling.addPerformanceDates.mockResolvedValue([other]);
    const done = vi.fn();
    render(
      wrap(
        <AddDatesDialog
          eventId="e1"
          performances={[performance]}
          venues={[venue]}
          defaultSource={performance}
          onDone={done}
          onClose={() => {}}
        />,
      ),
    );
    const dialog = screen.getByRole('dialog');
    await user.click(within(dialog).getByRole('button', { name: /^Add 0 dates/ }));
    expect(screen.getByRole('alert')).toHaveTextContent('Choose at least one day.');
    expect(scheduling.addPerformanceDates).not.toHaveBeenCalled();

    await user.click(within(dialog).getByRole('button', { name: 'Next month' }));
    for (const day of ['10', '20']) {
      const cell = within(dialog)
        .getAllByRole('gridcell')
        .find(
          (entry) => !entry.className.includes('calendar-outside') && entry.textContent === day,
        )!;
      await user.click(within(cell).getByRole('button'));
    }
    await user.click(within(dialog).getByRole('button', { name: /^Add 2 dates/ }));
    await waitFor(() => expect(done).toHaveBeenCalledWith([other]));
    const [eventId, body] = scheduling.addPerformanceDates.mock.calls[0];
    expect(eventId).toBe('e1');
    expect(body.startsAt).toHaveLength(2);
    expect(body.sourcePerformanceId).toBe('p1');
  });

  it('keeps the dialog open and shows the failure when the request is refused', async () => {
    const user = userEvent.setup();
    scheduling.addPerformanceDates.mockRejectedValue(new Error('Nothing was added.'));
    render(
      wrap(
        <AddDatesDialog
          eventId="e1"
          performances={[performance]}
          venues={[venue]}
          defaultSource={performance}
          onDone={() => {}}
          onClose={() => {}}
        />,
      ),
    );
    const dialog = screen.getByRole('dialog');
    await user.click(within(dialog).getByRole('button', { name: 'Next month' }));
    const cell = within(dialog)
      .getAllByRole('gridcell')
      .find(
        (entry) => !entry.className.includes('calendar-outside') && entry.textContent === '12',
      )!;
    await user.click(within(cell).getByRole('button'));
    await user.click(within(dialog).getByRole('button', { name: /^Add 1 date/ }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Nothing was added.');
  });
});

describe('DuplicateDialog', () => {
  it('creates a copy at the proposed start one week later', async () => {
    const user = userEvent.setup();
    scheduling.duplicatePerformance.mockResolvedValue(other);
    const done = vi.fn();
    render(wrap(<DuplicateDialog performance={performance} onDone={done} onClose={() => {}} />));
    await user.click(screen.getByRole('button', { name: 'Create draft copy' }));
    await waitFor(() => expect(done).toHaveBeenCalledWith(other));
    expect(scheduling.duplicatePerformance).toHaveBeenCalledWith('p1', '2030-03-12T12:00:00.000Z');
  });

  it('refuses a start in the past without calling the API', async () => {
    const user = userEvent.setup();
    render(
      wrap(
        <DuplicateDialog
          performance={{ ...performance, startsAt: '2020-01-01T12:00:00.000Z' }}
          onDone={() => {}}
          onClose={() => {}}
        />,
      ),
    );
    await user.click(screen.getByRole('button', { name: 'Create draft copy' }));
    expect(screen.getByRole('alert')).toHaveTextContent('Choose a start in the future.');
    expect(scheduling.duplicatePerformance).not.toHaveBeenCalled();
  });
});

describe('ApplyPricingDialog', () => {
  it('applies pricing to the chosen dates with their sale versions', async () => {
    const user = userEvent.setup();
    scheduling.applyPricing.mockResolvedValue([]);
    const done = vi.fn();
    render(
      wrap(
        <ApplyPricingDialog
          source={performance}
          candidates={[other]}
          onDone={done}
          onClose={() => {}}
        />,
      ),
    );
    await user.click(screen.getByRole('button', { name: 'Apply pricing' }));
    expect(screen.getByRole('alert')).toHaveTextContent('Choose at least one date.');
    await user.click(screen.getByRole('checkbox'));
    await user.click(screen.getByRole('button', { name: 'Apply pricing' }));
    await waitFor(() => expect(done).toHaveBeenCalledWith(1));
    expect(scheduling.applyPricing).toHaveBeenCalledWith('p1', [
      { performanceId: 'p2', expectedSaleVersion: 3 },
    ]);
  });

  it('explains when there is no date to apply to', () => {
    render(
      wrap(
        <ApplyPricingDialog
          source={performance}
          candidates={[]}
          onDone={() => {}}
          onClose={() => {}}
        />,
      ),
    );
    expect(screen.getByRole('status')).toHaveTextContent(/no other draft dates/);
    expect(screen.getByRole('button', { name: 'Apply pricing' })).toBeDisabled();
  });
});

const live: SalesState = {
  status: 'ON_SALE',
  salesSuspended: false,
  ticketingAcknowledged: true,
  pause: null,
  request: null,
  disruption: null,
};

describe('PerformanceSalesPanel', () => {
  it('pauses sales with a reason and reloads the state', async () => {
    const user = userEvent.setup();
    scheduling.getSalesState.mockResolvedValueOnce(live).mockResolvedValue({
      ...live,
      salesSuspended: true,
      pause: {
        id: 'pause1',
        state: 'PAUSING',
        reason: 'Rain',
        pausedAt: '2030-01-02T00:00:00Z',
        closedAt: null,
        ticketingAcknowledged: false,
      },
    });
    scheduling.pauseSales.mockResolvedValue({});
    render(wrap(<PerformanceSalesPanel performance={performance} />));
    await user.click(await screen.findByRole('button', { name: 'Pause sales' }));
    const dialog = screen.getByRole('dialog');
    const confirm = within(dialog).getByRole('button', { name: 'Pause sales' });
    expect(confirm).toBeDisabled();
    await user.type(within(dialog).getByLabelText('Reason'), 'Rain');
    await user.click(confirm);
    await waitFor(() =>
      expect(scheduling.pauseSales).toHaveBeenCalledWith('p1', expect.any(String), 'Rain'),
    );
    expect(await screen.findByText('Pausing…')).toBeInTheDocument();
  });

  it('offers resume for an organizer pause and withdraw for an open request', async () => {
    const user = userEvent.setup();
    scheduling.getSalesState.mockResolvedValue({
      ...live,
      salesSuspended: true,
      pause: {
        id: 'pause1',
        state: 'PAUSED',
        reason: 'Rain',
        pausedAt: '2030-01-02T00:00:00Z',
        closedAt: null,
        ticketingAcknowledged: true,
      },
      request: {
        id: 'r1',
        performanceId: 'p1',
        kind: 'CANCEL',
        reason: 'Weather',
        proposedStartsAt: null,
        proposedEndsAt: null,
        proposedDoorsOpenAt: null,
        state: 'REQUESTED',
        requestedAt: '2030-01-02T00:00:00Z',
        decidedAt: null,
        decisionReason: null,
        disruptionId: null,
      },
    } satisfies SalesState);
    scheduling.withdrawDisruptionRequest.mockResolvedValue({});
    render(wrap(<PerformanceSalesPanel performance={performance} />));
    expect(await screen.findByRole('button', { name: 'Resume sales' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Pause sales' })).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Withdraw request' }));
    await waitFor(() =>
      expect(scheduling.withdrawDisruptionRequest).toHaveBeenCalledWith('p1', 'r1'),
    );
  });

  it('shows nothing for a draft without controls', async () => {
    scheduling.getSalesState.mockResolvedValue({ ...live, status: 'DRAFT' });
    const { container } = render(wrap(<PerformanceSalesPanel performance={performance} />));
    await waitFor(() => expect(scheduling.getSalesState).toHaveBeenCalled());
    await waitFor(() => expect(container.querySelector('.scheduling-panel')).toBeNull());
  });
});

describe('VenueLibraryDialog', () => {
  it('saves venue edits with the expected version', async () => {
    const user = userEvent.setup();
    scheduling.updateVenue.mockResolvedValue({ ...venue, city: 'Hue', version: 3 });
    const change = vi.fn();
    render(wrap(<VenueLibraryDialog venues={[venue]} onChange={change} onClose={() => {}} />));
    const city = screen.getByLabelText('City');
    await user.clear(city);
    await user.type(city, 'Hue');
    await user.click(screen.getByRole('button', { name: 'Save venue' }));
    await waitFor(() => expect(change).toHaveBeenCalled());
    expect(scheduling.updateVenue).toHaveBeenCalledWith(
      'v1',
      expect.objectContaining({ expectedVersion: 2, city: 'Hue', name: 'Room' }),
    );
  });

  it('points to a new venue when the name is locked by a released performance', async () => {
    const user = userEvent.setup();
    scheduling.updateVenue.mockRejectedValue(new ApiClientError('Venue is in use.', 409));
    render(wrap(<VenueLibraryDialog venues={[venue]} onChange={() => {}} onClose={() => {}} />));
    await user.click(screen.getByRole('button', { name: 'Save venue' }));
    expect(await screen.findByRole('alert')).toHaveTextContent(/Venue is in use\..*new venue/);
  });

  it('creates a venue with its first space', async () => {
    const user = userEvent.setup();
    const created = { ...venue, id: 'v2', name: 'Arena' };
    management.createVenue.mockResolvedValue(created);
    const change = vi.fn();
    render(wrap(<VenueLibraryDialog venues={[venue]} onChange={change} onClose={() => {}} />));
    await user.click(screen.getByText('Add a new venue'));
    const dialog = screen.getByRole('dialog');
    const form = screen.getByRole('button', { name: 'Create venue' }).closest('form')!;
    await user.type(within(form).getByLabelText('Venue name'), 'Arena');
    await user.type(within(form).getByLabelText('Address'), '9 Road');
    await user.type(within(form).getByLabelText('First space'), 'Main');
    await user.click(within(dialog).getByRole('button', { name: 'Create venue' }));
    await waitFor(() => expect(change).toHaveBeenCalledWith(created));
    expect(management.createVenue).toHaveBeenCalledWith({
      name: 'Arena',
      address: '9 Road',
      spaceName: 'Main',
    });
  });
});

describe('DisruptionRequestsPanel', () => {
  const item: QueuedRequest = {
    request: {
      id: 'r1',
      performanceId: 'p1',
      kind: 'CANCEL',
      reason: 'Artist ill',
      proposedStartsAt: null,
      proposedEndsAt: null,
      proposedDoorsOpenAt: null,
      state: 'REQUESTED',
      requestedAt: '2030-01-02T00:00:00Z',
      decidedAt: null,
      decisionReason: null,
      disruptionId: null,
    },
    title: 'Tour',
    venueName: 'Room',
    startsAt: '2030-03-05T12:00:00Z',
    endsAt: '2030-03-05T14:00:00Z',
    timezone: 'Asia/Ho_Chi_Minh',
    performanceStatus: 'ON_SALE',
  };

  it('lists open requests with a link into the disruption workflow', async () => {
    scheduling.listDisruptionRequests.mockResolvedValue([item]);
    render(wrap(<DisruptionRequestsPanel />));
    expect(await screen.findByText('Artist ill')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Review and confirm' })).toHaveAttribute(
      'href',
      '/admin/performance-operations?performance=p1&request=r1',
    );
  });

  it('declines a request with a reason and reloads the queue', async () => {
    const user = userEvent.setup();
    scheduling.listDisruptionRequests.mockResolvedValueOnce([item]).mockResolvedValue([]);
    scheduling.declineDisruptionRequest.mockResolvedValue(item);
    render(wrap(<DisruptionRequestsPanel />));
    await user.click(await screen.findByRole('button', { name: 'Decline' }));
    const confirm = screen.getByRole('button', { name: 'Decline request' });
    expect(confirm).toBeDisabled();
    await user.type(screen.getByLabelText('Reason for declining'), 'Not needed');
    await user.click(confirm);
    await waitFor(() =>
      expect(scheduling.declineDisruptionRequest).toHaveBeenCalledWith('r1', 'Not needed'),
    );
    expect(await screen.findByText('No organizer requests are waiting.')).toBeInTheDocument();
  });
});
