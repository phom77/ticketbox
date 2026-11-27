import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import * as admin from '../../api/admin';
import * as content from '../../api/eventContent';
import { EventBioGenerator } from './EventBioGenerator';

vi.mock('../../api/admin');
vi.mock('../../api/eventContent');

const done = { status: 'DONE', resultBio: 'Generated bio' } as Awaited<
  ReturnType<typeof admin.getArtistBioJob>
>;
const wait = { timeout: 6_000 };

function Harness({
  initialBio,
  onSaved,
}: {
  initialBio: string;
  onSaved: (value: string) => void;
}) {
  const [title, setTitle] = useState('Title');
  const [bio, setBio] = useState(initialBio);
  return (
    <>
      <input aria-label="Title" value={title} onChange={(event) => setTitle(event.target.value)} />
      <output aria-label="Bio">{bio}</output>
      <EventBioGenerator
        eventId="e1"
        currentBio={bio}
        // Deliberately not functional: it reads the title from the render it was created in.
        onGenerated={(value) => {
          setBio(value);
          onSaved(title + '|' + value);
        }}
      />
    </>
  );
}

async function generate() {
  await userEvent.upload(
    document.querySelector<HTMLInputElement>('input[type="file"]')!,
    new File(['pdf'], 'artist.pdf', { type: 'application/pdf' }),
    { applyAccept: false },
  );
  await userEvent.click(screen.getByRole('button', { name: /Generate/ }));
}

beforeEach(() => {
  vi.resetAllMocks();
  vi.mocked(content.submitEventArtistBioJob).mockResolvedValue({
    data: { jobId: 'j1' },
  } as Awaited<ReturnType<typeof content.submitEventArtistBioJob>>);
  vi.mocked(admin.getArtistBioJob).mockResolvedValue(done);
});

describe('EventBioGenerator', () => {
  it('fills an empty biography with the latest callback, keeping edits made while it ran', async () => {
    const saved = vi.fn();
    render(<Harness initialBio="" onSaved={saved} />);
    await generate();
    await userEvent.type(screen.getByRole('textbox', { name: 'Title' }), ' edited');
    expect(await screen.findByText('Generated bio', undefined, wait)).toBeInTheDocument();
    expect(saved).toHaveBeenCalledWith('Title edited|Generated bio');
  }, 12_000);

  it('asks before replacing an existing biography', async () => {
    const saved = vi.fn();
    render(<Harness initialBio="Existing bio" onSaved={saved} />);
    await generate();
    const keep = await screen.findByRole('button', { name: 'Keep current biography' }, wait);
    expect(saved).not.toHaveBeenCalled();
    expect(screen.getByLabelText('Bio')).toHaveTextContent('Existing bio');
    await userEvent.click(keep);
    expect(saved).not.toHaveBeenCalled();
    await generate();
    await userEvent.click(
      await screen.findByRole('button', { name: 'Replace with generated draft' }, wait),
    );
    expect(saved).toHaveBeenCalledWith('Title|Generated bio');
  }, 15_000);
});
