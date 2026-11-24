import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { Layout } from '../../api/performances';
import { VenueMap, type SectionStats } from './PerformanceMaps';

const square = (x: number) => [
  { x, y: 0 },
  { x: x + 80, y: 0 },
  { x: x + 80, y: 80 },
  { x, y: 80 },
];
const layout: Layout = {
  version: 1,
  width: 400,
  height: 200,
  shapes: [],
  sections: [
    { id: 'a', code: 'A', label: 'Section A', kind: 'ASSIGNED', points: square(0) },
    { id: 'b', code: 'B', label: 'Section B', kind: 'GA', points: square(100) },
  ],
};
const stats = new Map<string, SectionStats>([
  ['a', { available: 12, fromPrice: 500000, held: 0, match: true }],
  ['b', { available: 0, fromPrice: 300000, held: 0, match: true }],
]);

describe('VenueMap', () => {
  it('exposes sections as named buttons that open on Enter and ignore sold-out ones', () => {
    const onSelect = vi.fn();
    render(
      <VenueMap
        layout={layout}
        stats={stats}
        selectedSection={null}
        onSelect={onSelect}
        onTip={() => {}}
      />,
    );
    const open = screen.getByRole('button', { name: /Section A/ });
    expect(open).toHaveAttribute('tabindex', '0');
    fireEvent.keyDown(open, { key: 'Enter' });
    expect(onSelect).toHaveBeenCalledWith('a');
    const sold = screen.getByRole('button', { name: /Section B/ });
    expect(sold).toHaveAttribute('aria-disabled', 'true');
    fireEvent.click(sold);
    expect(onSelect).toHaveBeenCalledTimes(1);
  });
});
