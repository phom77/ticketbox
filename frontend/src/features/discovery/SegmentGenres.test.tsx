import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { SegmentGenres } from './SegmentGenres';

const facets = {
  cities: [],
  segments: [{ id: 'concerts', count: 5 }],
  genres: [
    { id: 'vpop', segmentId: 'concerts', count: 3 },
    { id: 'jazz', segmentId: 'concerts', count: 1 },
    { id: 'football', segmentId: 'sports', count: 2 },
  ],
  categories: ['concerts'],
};

describe('SegmentGenres', () => {
  it('shows popular genres with events as chips and the rest under More genres', async () => {
    const onChoose = vi.fn();
    const user = userEvent.setup();
    render(<SegmentGenres segment="concerts" genre="" facets={facets} onChoose={onChoose} />);
    expect(screen.getByRole('heading', { name: 'Concerts' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /V-Pop/ })).toBeVisible();
    expect(screen.queryByRole('button', { name: /Football/ })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Jazz/, hidden: true })).not.toBeVisible();

    await user.click(screen.getByRole('button', { name: 'More genres' }));
    expect(screen.getByRole('button', { name: /Jazz/ })).toBeVisible();
    await user.click(screen.getByRole('button', { name: /Jazz/ }));
    expect(onChoose).toHaveBeenLastCalledWith('jazz');
  });

  it('marks the chosen genre and clears it again', async () => {
    const onChoose = vi.fn();
    const user = userEvent.setup();
    render(<SegmentGenres segment="concerts" genre="vpop" facets={facets} onChoose={onChoose} />);
    const chosen = screen.getByRole('button', { name: /V-Pop/ });
    expect(chosen).toHaveAttribute('aria-pressed', 'true');
    await user.click(chosen);
    expect(onChoose).toHaveBeenLastCalledWith('');
  });

  it('renders only the heading until genres with events are known', () => {
    render(
      <SegmentGenres
        segment="sports"
        genre=""
        facets={{ ...facets, genres: [] }}
        onChoose={() => undefined}
      />,
    );
    expect(screen.getByRole('heading', { name: 'Sports' })).toBeInTheDocument();
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
  });
});
