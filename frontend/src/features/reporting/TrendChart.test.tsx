import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { TrendChart, type TrendPoint } from './TrendChart';

const points = (money: boolean): TrendPoint[] =>
  [
    { key: 'a', axis: '01/12', label: '1 Dec', tickets: 2, revenue: 200000 },
    { key: 'b', axis: '02/12', label: '2 Dec', tickets: 5, revenue: 500000 },
  ].map((point) => (money ? point : { ...point, revenue: undefined }));

describe('TrendChart', () => {
  it('announces the active point and moves it with keyboard focus', () => {
    render(<TrendChart points={points(false)} />);
    const summary = document.querySelector('.revenue-chart-summary') as HTMLElement;
    expect(summary).toHaveTextContent('2 Dec');
    fireEvent.focus(screen.getAllByRole('img', { name: /1 Dec/ })[0]);
    expect(summary).toHaveTextContent('1 Dec');
    expect(summary).toHaveTextContent('2');
  });

  it('offers the revenue series only with revenue data', () => {
    const { rerender } = render(<TrendChart points={points(false)} />);
    expect(screen.queryByRole('button', { name: /revenue/i })).toBeNull();
    rerender(<TrendChart points={points(true)} />);
    const revenue = screen.getByRole('button', { name: /revenue/i });
    fireEvent.click(revenue);
    expect(revenue).toHaveAttribute('aria-pressed', 'true');
    expect(document.querySelector('.revenue-chart-summary')).toHaveTextContent(/500/);
  });

  it('shows an empty state without points', () => {
    render(<TrendChart points={[]} />);
    expect(screen.getByText(/no sales/i)).toBeInTheDocument();
  });
});
