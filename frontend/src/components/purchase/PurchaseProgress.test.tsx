import { render, screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { PurchaseProgress } from './PurchaseProgress';

describe('PurchaseProgress', () => {
  it('labels the current step and marks earlier steps complete', () => {
    render(<PurchaseProgress current="checkout" />);
    expect(screen.getByText('Step 3 of 4: Checkout')).toBeInTheDocument();
    const list = screen.getByRole('list', { name: 'Purchase progress' });
    const items = within(list).getAllByRole('listitem');
    expect(items).toHaveLength(4);
    expect(items[2]).toHaveAttribute('aria-current', 'step');
    expect(items[0]).toHaveTextContent('Choose date (completed)');
    expect(items[1]).toHaveAttribute('data-state', 'complete');
    expect(items[3]).toHaveAttribute('data-state', 'upcoming');
  });
});
