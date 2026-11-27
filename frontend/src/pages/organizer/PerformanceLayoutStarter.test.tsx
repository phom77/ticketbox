import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { PerformanceLayoutStarter } from './PerformanceLayoutStarter';

function open(onStarter = vi.fn()) {
  render(
    <PerformanceLayoutStarter
      templates={[{ id: 't1', name: 'Hall template', venueSpaceId: 's', revision: 1 }]}
      disabled={false}
      onTemplate={vi.fn()}
      onStarter={onStarter}
      onBlank={vi.fn()}
      onAdmission={vi.fn()}
    />,
  );
  return onStarter;
}

describe('PerformanceLayoutStarter', () => {
  it('lists templates, starters, admission and a blank canvas', () => {
    open();
    expect(screen.getByRole('button', { name: 'Hall template' })).toBeVisible();
    for (const name of [/Standing floor/, /Numbered theatre/, /Arena/])
      expect(screen.getByRole('button', { name })).toBeVisible();
    expect(screen.getByRole('button', { name: 'General admission without a map' })).toBeVisible();
    expect(screen.getByRole('button', { name: 'Blank canvas' })).toBeVisible();
  });

  it('shows the seat total and hands the generated layout to the draft', () => {
    const onStarter = open();
    fireEvent.click(screen.getByRole('button', { name: /Numbered theatre/ }));
    expect(screen.getByText('360 seats and 0 standing places')).toBeVisible();
    fireEvent.click(screen.getByRole('button', { name: 'Use this layout' }));
    expect(onStarter).toHaveBeenCalledTimes(1);
    const [layout, summary] = onStarter.mock.calls[0];
    expect(summary.seats).toBe(360);
    expect(layout.sections[0].rows).toHaveLength(15);
    expect(layout.shapes[0].kind).toBe('STAGE');
  });

  it('refuses sizes above the seat limit and names what to reduce', () => {
    const onStarter = open();
    fireEvent.click(screen.getByRole('button', { name: /Numbered theatre/ }));
    fireEvent.change(screen.getByLabelText('Rows per stand'), { target: { value: '500' } });
    fireEvent.change(screen.getByLabelText('Seats per row'), { target: { value: '500' } });
    expect(screen.getByRole('alert')).toHaveTextContent(/up to 100,000 seats/);
    expect(screen.getByRole('button', { name: 'Use this layout' })).toBeDisabled();
    expect(onStarter).not.toHaveBeenCalled();
  });
});
