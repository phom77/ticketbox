import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { ClassificationPicker, type ClassificationChoice } from './ClassificationPicker';

vi.mock('../api/performances', () => ({
  getClassifications: () => Promise.reject(new Error('offline')),
}));

function Harness({ initial }: { initial: ClassificationChoice }) {
  const [value, setValue] = useState(initial);
  return (
    <>
      <ClassificationPicker value={value} onChange={setValue} />
      <output data-testid="value">{JSON.stringify(value)}</output>
    </>
  );
}

const empty = { segment: '', primaryGenre: '', genres: [] };
const state = () =>
  JSON.parse(screen.getByTestId('value').textContent ?? '{}') as ClassificationChoice;

describe('ClassificationPicker', () => {
  it('offers the six segments as a radio group and needs a segment before a genre', async () => {
    const user = userEvent.setup();
    render(<Harness initial={empty} />);
    expect(screen.getAllByRole('radio')).toHaveLength(6);
    expect(screen.getByRole('combobox', { name: 'Main genre' })).toBeDisabled();
    await user.click(screen.getByRole('radio', { name: 'Sports' }));
    expect(state().segment).toBe('sports');
    expect(screen.getByRole('combobox', { name: 'Main genre' })).toBeEnabled();
  });

  it('filters the genres of the segment and picks one with the keyboard', async () => {
    const user = userEvent.setup();
    render(<Harness initial={{ ...empty, segment: 'concerts' }} />);
    const field = screen.getByRole('combobox', { name: 'Main genre' });
    await user.click(field);
    expect(field).toHaveAttribute('aria-expanded', 'true');
    const list = screen.getByRole('listbox', { name: 'Main genre' });
    // Popular genres come first and genres of other segments are absent.
    expect(within(list).getAllByRole('option')[0]).toHaveTextContent('V-Pop');
    expect(within(list).queryByRole('option', { name: 'Football' })).not.toBeInTheDocument();

    await user.type(field, 'roc');
    expect(
      within(list)
        .getAllByRole('option')
        .map((option) => option.textContent),
    ).toEqual(['Rock']);
    await user.keyboard('{Enter}');
    expect(state().primaryGenre).toBe('rock');
    expect(field).toHaveValue('Rock');
    expect(field).toHaveAttribute('aria-expanded', 'false');

    await user.click(field);
    await user.keyboard('{ArrowDown}{ArrowDown}{Enter}');
    expect(state().primaryGenre).not.toBe('rock');
    await user.click(field);
    await user.keyboard('{Escape}');
    expect(field).toHaveAttribute('aria-expanded', 'false');
  });

  it('clears a primary genre outside the new segment and keeps one inside it', async () => {
    const user = userEvent.setup();
    render(
      <Harness initial={{ segment: 'concerts', primaryGenre: 'vpop', genres: ['football'] }} />,
    );
    await user.click(screen.getByRole('radio', { name: 'Sports' }));
    expect(state()).toEqual({ segment: 'sports', primaryGenre: '', genres: ['football'] });
    await user.click(screen.getByRole('radio', { name: 'Concerts' }));
    expect(state().primaryGenre).toBe('');
  });

  it('adds tags from any segment, removes them and stops at three', async () => {
    const user = userEvent.setup();
    render(<Harness initial={{ segment: 'concerts', primaryGenre: 'vpop', genres: [] }} />);
    const tags = screen.getByRole('combobox', { name: 'Additional genres' });
    await user.click(tags);
    await user.type(tags, 'foot');
    await user.keyboard('{Enter}');
    expect(state().genres).toEqual(['football']);
    // The field stays open for the next tag; the primary genre is not offered again.
    await user.type(tags, 'v-pop');
    expect(screen.getByText('No genre matches')).toBeInTheDocument();
    await user.clear(tags);
    await user.type(tags, 'jazz');
    await user.keyboard('{Enter}');
    await user.type(tags, 'rock');
    await user.keyboard('{Enter}');
    expect(state().genres).toEqual(['football', 'jazz', 'rock']);
    expect(tags).toBeDisabled();
    expect(screen.getByText(/3 of 3 additional genres chosen/)).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Remove Jazz' }));
    expect(state().genres).toEqual(['football', 'rock']);
    expect(tags).toBeEnabled();
  });

  it('drops a tag that becomes the primary genre', async () => {
    const user = userEvent.setup();
    render(<Harness initial={{ segment: 'concerts', primaryGenre: 'vpop', genres: ['rock'] }} />);
    const field = screen.getByRole('combobox', { name: 'Main genre' });
    await user.click(field);
    await user.type(field, 'rock');
    await user.keyboard('{Enter}');
    expect(state()).toEqual({ segment: 'concerts', primaryGenre: 'rock', genres: [] });
  });
});
