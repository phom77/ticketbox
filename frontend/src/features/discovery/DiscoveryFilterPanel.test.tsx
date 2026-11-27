import { render, screen, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { DiscoveryFilterPanel } from './DiscoveryFilterPanel';
import { readDiscoveryFilters } from './filters';

const facets = {
  cities: ['Hanoi', 'Ho Chi Minh City'],
  segments: [{ id: 'concerts', count: 4 }],
  genres: [
    { id: 'jazz', segmentId: 'concerts', count: 2 },
    { id: 'football', segmentId: 'sports', count: 1 },
  ],
  categories: ['concerts'],
};

function renderPanel(query = '') {
  const onApply = vi.fn();
  render(
    <DiscoveryFilterPanel
      filters={readDiscoveryFilters(new URLSearchParams(query))}
      facets={facets}
      count={12}
      onApply={onApply}
    />,
  );
  return { onApply, user: userEvent.setup() };
}

describe('DiscoveryFilterPanel', () => {
  it('offers the cities, segments and genres that have events and applies a choice immediately', async () => {
    const { onApply, user } = renderPanel();
    const city = screen.getByRole('combobox', { name: /City/ });
    expect(screen.getByRole('option', { name: 'Hanoi' })).toBeInTheDocument();
    expect(screen.getByRole('option', { name: 'Jazz' })).toBeInTheDocument();
    expect(screen.queryByRole('option', { name: 'V-Pop' })).not.toBeInTheDocument();
    await user.selectOptions(city, 'Hanoi');
    expect(onApply).toHaveBeenCalledWith({ city: 'Hanoi' });
    await user.selectOptions(screen.getByRole('combobox', { name: /Category/ }), 'sports');
    expect(onApply).toHaveBeenLastCalledWith({ segment: 'sports', genre: '' });
    await user.selectOptions(screen.getByRole('combobox', { name: /Genre/ }), 'jazz');
    expect(onApply).toHaveBeenLastCalledWith({ genre: 'jazz', segment: 'concerts' });
    await user.selectOptions(screen.getByRole('combobox', { name: /Price/ }), '500000-1000000');
    expect(onApply).toHaveBeenLastCalledWith({ price: '500000-1000000' });
  });

  it('applies date presets and shows a calendar range only for custom dates', async () => {
    const { onApply, user } = renderPanel();
    expect(screen.queryByLabelText(/From date/)).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'This weekend' }));
    expect(onApply).toHaveBeenLastCalledWith({ date: 'weekend', from: '', to: '' });

    await user.click(screen.getByRole('button', { name: 'Choose dates' }));
    fireEvent.change(screen.getByLabelText(/From date/), { target: { value: '2026-12-01' } });
    expect(onApply).toHaveBeenLastCalledWith({ date: 'custom', from: '2026-12-01', to: '' });
  });

  it('narrows the genres to the chosen segment and drops a genre outside a new segment', async () => {
    const { onApply, user } = renderPanel('segment=concerts&genre=jazz');
    expect(screen.getByRole('option', { name: 'Jazz' })).toBeInTheDocument();
    expect(screen.queryByRole('option', { name: 'Football' })).not.toBeInTheDocument();
    await user.selectOptions(screen.getByRole('combobox', { name: /Category/ }), 'sports');
    expect(onApply).toHaveBeenLastCalledWith({ segment: 'sports', genre: '' });
  });

  it('keeps a city from the URL selectable and opens as a sheet with a result count', async () => {
    const { user } = renderPanel('city=Da+Nang');
    expect(screen.getByRole('option', { name: 'Da Nang' })).toBeInTheDocument();
    const trigger = screen.getByRole('button', { name: /Filters/ });
    expect(trigger).toHaveAttribute('aria-expanded', 'false');
    await user.click(trigger);
    expect(screen.getByRole('dialog', { name: 'Filters' })).toBeInTheDocument();
    await user.keyboard('{Escape}');
    expect(trigger).toHaveAttribute('aria-expanded', 'false');
    expect(trigger).toHaveFocus();
    expect(screen.getByRole('button', { name: 'Show 12 events' })).toBeInTheDocument();
  });
});
