import { act, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { HeaderSearch } from './HeaderSearch';

const getDiscoveryEvents = vi.hoisted(() => vi.fn());
vi.mock('../../api/performances', async (original) => ({
  ...(await original<typeof import('../../api/performances')>()),
  getDiscoveryEvents,
}));

const empty = { where: '', what: '', date: '' as const, from: '', to: '' };
const show = {
  id: 'show-1',
  eventId: 'event-1',
  title: 'Jazz Night',
  venueName: 'Hanoi Opera House',
  eventDate: '2027-01-10T12:30:00Z',
  saleStartAt: '2026-12-01T00:00:00Z',
  saleEndAt: null,
  status: 'ON_SALE',
  posterUrl: null,
  salesSuspended: false,
};

function renderSearch(initial = empty) {
  const onSearch = vi.fn();
  const onOpenEvent = vi.fn();
  render(<HeaderSearch initial={initial} onSearch={onSearch} onOpenEvent={onOpenEvent} />);
  return { onSearch, onOpenEvent, what: screen.getByRole('combobox', { name: /Find events/ }) };
}

describe('HeaderSearch', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    localStorage.clear();
    getDiscoveryEvents.mockReset();
    getDiscoveryEvents.mockResolvedValue({ content: [show], totalElements: 1, last: true });
  });
  afterEach(() => vi.useRealTimers());

  it('submits What, Where and When as discovery values and remembers the search', () => {
    const { onSearch, what } = renderSearch();
    fireEvent.change(screen.getByRole('textbox', { name: 'Where: city or venue' }), {
      target: { value: ' Hà Nội ' },
    });
    fireEvent.change(what, { target: { value: 'jazz' } });
    fireEvent.click(screen.getByRole('button', { name: 'When: Any date' }));
    fireEvent.click(screen.getByRole('radio', { name: 'This weekend' }));
    fireEvent.click(screen.getByRole('button', { name: 'Search' }));
    expect(onSearch).toHaveBeenCalledWith({
      where: 'Hà Nội',
      what: 'jazz',
      date: 'weekend',
      from: '',
      to: '',
    });
    expect(JSON.parse(localStorage.getItem('ticketbox.recent-searches') ?? '[]')).toEqual([
      { what: 'jazz', where: 'Hà Nội' },
    ]);
  });

  it('drops an empty custom range instead of sending an invalid filter', () => {
    const { onSearch } = renderSearch();
    fireEvent.click(screen.getByRole('button', { name: 'When: Any date' }));
    fireEvent.click(screen.getByRole('radio', { name: 'Choose dates' }));
    fireEvent.click(screen.getByRole('button', { name: 'Search' }));
    expect(onSearch).toHaveBeenCalledWith(expect.objectContaining({ date: '', from: '', to: '' }));
  });

  it('suggests events and venues and opens an event from the keyboard', async () => {
    const { onOpenEvent, what } = renderSearch();
    fireEvent.focus(what);
    fireEvent.change(what, { target: { value: 'hanoi' } });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(300);
    });
    expect(getDiscoveryEvents).toHaveBeenCalledWith('q=hanoi', 0, expect.any(AbortSignal));
    expect(screen.getByRole('option', { name: /Jazz Night/ })).toBeInTheDocument();
    expect(screen.getByRole('option', { name: 'Hanoi Opera House' })).toBeInTheDocument();
    expect(what).toHaveAttribute('aria-expanded', 'true');

    fireEvent.keyDown(what, { key: 'ArrowDown' });
    expect(what.getAttribute('aria-activedescendant')).toBe(
      screen.getByRole('option', { name: /Jazz Night/ }).id,
    );
    fireEvent.keyDown(what, { key: 'Enter' });
    expect(onOpenEvent).toHaveBeenCalledWith('/events/event-1?performance=show-1');
  });

  it('closes suggestions on Escape without letting the header close the panel', async () => {
    const { what } = renderSearch();
    fireEvent.focus(what);
    fireEvent.change(what, { target: { value: 'hanoi' } });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(300);
    });
    const escape = new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true });
    act(() => {
      what.dispatchEvent(escape);
    });
    expect(escape.defaultPrevented).toBe(true);
    expect(what).toHaveAttribute('aria-expanded', 'false');
  });

  it('offers recent searches when empty and can clear them', () => {
    localStorage.setItem(
      'ticketbox.recent-searches',
      JSON.stringify([{ what: 'pop', where: 'Huế' }]),
    );
    const { onSearch, what } = renderSearch();
    fireEvent.focus(what);
    expect(screen.getByRole('option', { name: 'pop · Huế' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('option', { name: 'Clear recent searches' }));
    expect(screen.queryByRole('option', { name: 'pop · Huế' })).not.toBeInTheDocument();
    expect(localStorage.getItem('ticketbox.recent-searches')).toBeNull();
    expect(onSearch).not.toHaveBeenCalled();
  });

  it('says when suggestions fail and still allows searching', async () => {
    getDiscoveryEvents.mockRejectedValue(new Error('down'));
    const { onSearch, what } = renderSearch();
    fireEvent.focus(what);
    fireEvent.change(what, { target: { value: 'rock' } });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(300);
    });
    expect(screen.getByText(/Suggestions are unavailable/)).toBeInTheDocument();
    fireEvent.keyDown(what, { key: 'Enter' });
    fireEvent.submit(what.closest('form')!);
    expect(onSearch).toHaveBeenCalledWith(expect.objectContaining({ what: 'rock' }));
  });
});
