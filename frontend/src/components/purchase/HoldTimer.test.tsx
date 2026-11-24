import { act, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { HoldTimer } from './HoldTimer';

describe('HoldTimer', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-11-24T10:00:00Z'));
  });
  afterEach(() => vi.useRealTimers());

  it('keeps the time silent and announces the warning and expiry once each', () => {
    render(<HoldTimer expiresAt="2026-11-24T10:02:05Z" label="Payment deadline" />);
    const timer = screen.getByRole('timer', { name: 'Payment deadline' });
    expect(timer).toHaveAttribute('aria-live', 'off');
    expect(timer).toHaveTextContent('02:05');
    const status = screen.getByRole('status');
    expect(status).toBeEmptyDOMElement();

    act(() => {
      vi.advanceTimersByTime(6_000);
    });
    expect(status).toHaveTextContent('Less than 2 minutes left');
    const warning = status.textContent;
    act(() => {
      vi.advanceTimersByTime(30_000);
    });
    // The message text does not change on each tick, so it is not re-announced.
    expect(status.textContent).toBe(warning);

    act(() => {
      vi.advanceTimersByTime(120_000);
    });
    expect(screen.queryByRole('timer')).not.toBeInTheDocument();
    expect(screen.getByText('Time is up')).toBeInTheDocument();
    expect(status).toHaveTextContent('Time is up for this step.');
  });

  it('shows hours for long waits and nothing without a deadline', () => {
    const { rerender, container } = render(
      <HoldTimer expiresAt="2026-11-24T12:30:00Z" label="Sale opens in" />,
    );
    expect(screen.getByRole('timer')).toHaveTextContent('2:30:00');
    rerender(<HoldTimer expiresAt={null} label="Sale opens in" />);
    expect(container).toBeEmptyDOMElement();
  });

  it('lets the page own the expiry announcement', () => {
    render(
      <HoldTimer expiresAt="2026-11-24T09:00:00Z" label="Payment deadline" expiredMessage="" />,
    );
    expect(screen.getByText('Time is up')).toBeInTheDocument();
    expect(screen.getByRole('status')).toBeEmptyDOMElement();
  });
});
