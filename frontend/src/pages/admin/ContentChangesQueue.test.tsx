import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiClientError } from '../../api/client';
import * as content from '../../api/eventContent';
import type { ManagedEvent } from '../../api/performanceManagement';
import { ToastProvider } from '../../components/feedback/ToastProvider';
import { ContentChangesQueue } from './ContentChangesQueue';

vi.mock('../../api/eventContent');

const live = {
  id: 'e1',
  title: 'Live show',
  description: 'Old description',
  translations: {},
  artistBio: null,
  ageRating: null,
  refundPolicy: null,
  posterUrl: null,
} as unknown as ManagedEvent;

const row = {
  eventId: 'e1',
  organizationId: 'o1',
  title: 'Live show',
  state: 'SUBMITTED' as const,
  revision: 3,
  submittedAt: '2026-11-20T03:00:00Z',
  reason: null,
};

const revision = {
  eventId: 'e1',
  revision: 3,
  state: 'SUBMITTED' as const,
  content: {
    title: 'Live show',
    description: 'New description',
    translations: {},
    artistBio: null,
    ageRating: '16+' as const,
    refundPolicy: null,
  },
  posterUrl: null,
  posterChanged: false,
  reason: null,
  submittedAt: row.submittedAt,
  decidedAt: null,
};

function renderQueue() {
  return render(
    <ToastProvider>
      <MemoryRouter initialEntries={['/admin/event-review?tab=content']}>
        <ContentChangesQueue />
      </MemoryRouter>
    </ToastProvider>,
  );
}

beforeEach(() => {
  vi.resetAllMocks();
  vi.mocked(content.getContentRevisionQueue).mockResolvedValue({
    content: [row],
    totalElements: 1,
    totalPages: 1,
    number: 0,
    size: 20,
    first: true,
    last: true,
    empty: false,
  });
  vi.mocked(content.getContentRevisionReview).mockResolvedValue({ event: live, revision });
});

describe('ContentChangesQueue', () => {
  it('compares the live and proposed content and marks what changed', async () => {
    renderQueue();
    await userEvent.click(await screen.findByText('Live show', { selector: 'strong' }));
    const table = await screen.findByRole('table');
    expect(within(table).getByText('Old description')).toBeInTheDocument();
    expect(within(table).getByText('New description')).toBeInTheDocument();
    const changed = table.querySelectorAll('tr[data-changed]');
    expect(changed).toHaveLength(2);
  });

  it('approves the submitted revision it was shown', async () => {
    vi.mocked(content.decideContentRevision).mockResolvedValue({
      event: live,
      revision: { ...revision, state: 'APPROVED' },
    });
    renderQueue();
    await userEvent.click(await screen.findByText('Live show', { selector: 'strong' }));
    await userEvent.click(await screen.findByRole('button', { name: 'Approve changes' }));
    await waitFor(() =>
      expect(content.decideContentRevision).toHaveBeenCalledWith('e1', 'APPROVE', 3, ''),
    );
  });

  it('shows the latest revision again when a decision hits a conflict', async () => {
    vi.mocked(content.decideContentRevision).mockRejectedValue(new ApiClientError('Stale', 409));
    renderQueue();
    await userEvent.click(await screen.findByText('Live show', { selector: 'strong' }));
    await userEvent.click(await screen.findByRole('button', { name: 'Approve changes' }));
    expect(await screen.findByRole('alert')).toHaveTextContent(/changed while you were reviewing/);
    expect(content.getContentRevisionReview).toHaveBeenCalledTimes(2);
  });

  it('needs a reason before asking for changes or rejecting', async () => {
    renderQueue();
    await userEvent.click(await screen.findByText('Live show', { selector: 'strong' }));
    expect(await screen.findByRole('button', { name: 'Request changes' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Reject' })).toBeDisabled();
    await userEvent.type(screen.getByRole('textbox'), 'Needs a venue name');
    expect(screen.getByRole('button', { name: 'Request changes' })).toBeEnabled();
  });
});
