import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import * as content from '../../api/eventContent';
import * as management from '../../api/performanceManagement';
import { ToastProvider } from '../../components/feedback/ToastProvider';
import { EventDetailsStep } from './EventDetailsStep';

vi.mock('../../api/eventContent');
vi.mock('../../api/performanceManagement');

const event = {
  id: 'e1',
  title: 'Live show',
  description: 'Old description',
  category: 'concerts',
  draftVersion: 4,
  contentVersion: 7,
  performances: [],
  posterUrl: null,
  translations: {},
  artistBio: null,
  ageRating: null,
  refundPolicy: null,
} as unknown as management.ManagedEvent;

const callbacks = {
  onDirtyChange: vi.fn(),
  onBusyChange: vi.fn(),
  onEventChange: vi.fn(),
};

function renderStep(props: Partial<React.ComponentProps<typeof EventDetailsStep>> = {}) {
  return render(
    <ToastProvider>
      <MemoryRouter>
        <EventDetailsStep released={false} {...callbacks} {...props} />
      </MemoryRouter>
    </ToastProvider>,
  );
}

function revision(state: content.RevisionState, extra = {}) {
  return {
    eventId: 'e1',
    revision: 1,
    state,
    content: {
      title: 'Live show',
      description: 'New description',
      translations: {},
      artistBio: null,
      ageRating: null,
      refundPolicy: null,
    },
    posterUrl: null,
    posterChanged: false,
    reason: null,
    submittedAt: null,
    decidedAt: null,
    ...extra,
  } satisfies content.ContentRevision;
}

beforeEach(() => vi.resetAllMocks());

describe('new event', () => {
  it('rejects a poster that is not an image before uploading anything', async () => {
    renderStep();
    const input = document.querySelector<HTMLInputElement>('input[type="file"][accept^="image"]')!;
    await userEvent.upload(input, new File(['x'], 'poster.gif', { type: 'image/gif' }), {
      applyAccept: false,
    });
    expect(await screen.findByRole('alert')).toHaveTextContent(/JPEG, PNG or WebP/);
  });

  it('creates the event with its content and then uploads the chosen poster', async () => {
    const created = { ...event, id: 'new', draftVersion: 1, contentVersion: 1 };
    vi.mocked(management.createManagedEvent).mockResolvedValue(created);
    vi.mocked(content.uploadEventPoster).mockResolvedValue({ event: created, revision: null });
    const onCreated = vi.fn();
    renderStep({ onCreated });
    await userEvent.type(screen.getByRole('textbox', { name: 'Title' }), 'Night of jazz');
    await userEvent.type(screen.getByRole('textbox', { name: /Refund policy/ }), 'Full refund');
    const file = new File(['png'], 'poster.png', { type: 'image/png' });
    await userEvent.upload(
      document.querySelector<HTMLInputElement>('input[type="file"][accept^="image"]')!,
      file,
    );
    await userEvent.click(screen.getByRole('button', { name: /Save and continue/ }));
    await waitFor(() => expect(onCreated).toHaveBeenCalledWith(created));
    expect(management.createManagedEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        title: 'Night of jazz',
        refundPolicy: 'Full refund',
        ageRating: null,
      }),
    );
    expect(content.uploadEventPoster).toHaveBeenCalledWith('new', file, { expectedVersion: 1 });
  });

  it('asks for a title', async () => {
    renderStep();
    await userEvent.click(screen.getByRole('button', { name: /Save and continue/ }));
    expect(management.createManagedEvent).not.toHaveBeenCalled();
  });
});

describe('released event', () => {
  it('shows the live version and stages edits as a draft revision', async () => {
    vi.mocked(content.getEventContent).mockResolvedValue({ event, revision: null });
    vi.mocked(content.stageContentRevision).mockResolvedValue({
      event,
      revision: revision('DRAFTING'),
    });
    renderStep({ event, released: true });
    expect(await screen.findByText(/Buyers see this version/)).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Edit details' }));
    const description = screen.getByRole('textbox', { name: 'Description (optional)' });
    await userEvent.clear(description);
    await userEvent.type(description, 'New description');
    await userEvent.click(screen.getByRole('button', { name: 'Save changes' }));
    await waitFor(() =>
      expect(content.stageContentRevision).toHaveBeenCalledWith(
        'e1',
        0,
        expect.objectContaining({ description: 'New description' }),
      ),
    );
    expect(await screen.findByText('Drafting changes')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Submit for review' })).toBeInTheDocument();
  });

  it('submits a drafted revision for review and then offers to withdraw it', async () => {
    vi.mocked(content.getEventContent).mockResolvedValue({ event, revision: revision('DRAFTING') });
    vi.mocked(content.submitContentRevision).mockResolvedValue({
      event,
      revision: revision('SUBMITTED'),
    });
    renderStep({ event, released: true });
    await userEvent.click(await screen.findByRole('button', { name: 'Submit for review' }));
    expect(content.submitContentRevision).toHaveBeenCalledWith('e1', 1);
    expect(await screen.findByRole('button', { name: 'Withdraw' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Edit details' })).not.toBeInTheDocument();
  });

  it('shows why changes were requested', async () => {
    vi.mocked(content.getEventContent).mockResolvedValue({
      event,
      revision: revision('CHANGES_REQUESTED', { reason: 'Add the venue name' }),
    });
    renderStep({ event, released: true });
    expect(await screen.findByText('Changes requested')).toBeInTheDocument();
    expect(screen.getByText(/Add the venue name/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Continue editing' })).toBeInTheDocument();
  });

  it('uses the content version, not the draft version, to save and to replace the poster of a draft', async () => {
    const updated = { ...event, contentVersion: 8 };
    vi.mocked(management.updateManagedEvent).mockResolvedValue(updated);
    vi.mocked(content.uploadEventPoster).mockResolvedValue({ event: updated, revision: null });
    renderStep({ event });
    await userEvent.upload(
      document.querySelector<HTMLInputElement>('input[type="file"][accept^="image"]')!,
      new File(['png'], 'poster.png', { type: 'image/png' }),
    );
    await waitFor(() =>
      expect(content.uploadEventPoster).toHaveBeenCalledWith('e1', expect.any(File), {
        expectedVersion: 7,
      }),
    );
    await userEvent.click(screen.getByRole('button', { name: /Save and continue/ }));
    await waitFor(() =>
      expect(management.updateManagedEvent).toHaveBeenCalledWith('e1', 7, expect.anything()),
    );
  });

  it('sends the server revision number after a revision was approved, so the next edit is accepted', async () => {
    vi.mocked(content.getEventContent).mockResolvedValue({
      event,
      revision: revision('APPROVED', { revision: 3 }),
    });
    vi.mocked(content.stageContentRevision).mockResolvedValue({
      event,
      revision: revision('DRAFTING', { revision: 4 }),
    });
    vi.mocked(content.uploadEventPoster).mockResolvedValue({
      event,
      revision: revision('DRAFTING', { revision: 5, posterChanged: true }),
    });
    renderStep({ event, released: true });
    await userEvent.click(await screen.findByRole('button', { name: 'Edit details' }));
    await userEvent.upload(
      document.querySelector<HTMLInputElement>('input[type="file"][accept^="image"]')!,
      new File(['png'], 'poster.png', { type: 'image/png' }),
    );
    await waitFor(() =>
      expect(content.uploadEventPoster).toHaveBeenCalledWith('e1', expect.any(File), {
        expectedRevision: 3,
      }),
    );
    await userEvent.click(screen.getByRole('button', { name: 'Save changes' }));
    await waitFor(() =>
      // The poster change moved the server revision on to 5; the next save sends that one.
      expect(content.stageContentRevision).toHaveBeenCalledWith('e1', 5, expect.anything()),
    );
  });

  it('treats an approved revision as live content', async () => {
    vi.mocked(content.getEventContent).mockResolvedValue({ event, revision: revision('APPROVED') });
    renderStep({ event, released: true });
    expect(await screen.findByText(/Buyers see this version/)).toBeInTheDocument();
    expect(screen.queryByText('Proposed version')).not.toBeInTheDocument();
  });
});
