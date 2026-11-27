import { fireEvent, render, screen, within } from '@testing-library/react';
import { useState } from 'react';
import { describe, expect, it } from 'vitest';
import type { DraftLayout, ManagedPerformance, SaleDraft } from '../../api/performanceManagement';
import { PerformanceSaleEditor } from './PerformanceSaleEditor';

const performance = {
  id: 'p1',
  timezone: 'Asia/Ho_Chi_Minh',
  saleStartAt: '2026-12-01T03:00:00.000Z',
  saleEndAt: '2026-12-31T13:00:00.000Z',
  maxPerAccount: 4,
} as ManagedPerformance;

const pool = {
  id: 'g1',
  sectionId: null,
  sectionLabel: 'Floor',
  kind: 'GA' as const,
  capacity: 100,
  seats: [],
};
const standard = {
  id: 'o1',
  groupId: 'g1',
  name: 'Standard',
  price: 500000,
  currency: 'VND' as const,
  active: true,
  saleStartAt: performance.saleStartAt,
  saleEndAt: performance.saleEndAt,
};

let latest: SaleDraft;

function Harness({
  initial,
  immutable = false,
  layout = null,
}: {
  initial: SaleDraft;
  immutable?: boolean;
  layout?: DraftLayout | null;
}) {
  const [sale, setSale] = useState(initial);
  latest = sale;
  return (
    <PerformanceSaleEditor
      sale={sale}
      setSale={setSale}
      layout={layout}
      performance={performance}
      immutable={immutable}
      disabled={false}
      editedDates={{}}
      dateErrors={{}}
      onDateChange={() => undefined}
      onResetDates={() => undefined}
    />
  );
}

describe('PerformanceSaleEditor', () => {
  it('creates a new stock pool with the first ticket type and uses plain words', () => {
    render(<Harness initial={{ version: 1, groups: [], offers: [] }} />);
    const form = screen.getByRole('form', { name: 'Add general admission ticket' });
    fireEvent.change(within(form).getByLabelText('Ticket type name'), {
      target: { value: 'General' },
    });
    fireEvent.change(within(form).getByLabelText(/^Capacity/), { target: { value: '250' } });
    fireEvent.change(within(form).getByLabelText(/^Price in VND/), {
      target: { value: '1500000' },
    });
    fireEvent.submit(form);
    expect(latest.groups).toHaveLength(1);
    expect(latest.groups[0]).toMatchObject({ kind: 'GA', capacity: 250 });
    expect(latest.offers).toHaveLength(1);
    expect(latest.offers[0]).toMatchObject({ name: 'General', price: 1500000 });
    expect(latest.offers[0].groupId).toBe(latest.groups[0].id);
    expect(screen.getByRole('heading', { name: 'Tickets and stock' })).toBeVisible();
    expect(document.body.textContent).not.toMatch(/inventory group|sale offer/i);
  });

  it('adds an early bird that shares the pool and explains the shared capacity', () => {
    render(<Harness initial={{ version: 1, groups: [pool], offers: [standard] }} />);
    fireEvent.click(screen.getByRole('button', { name: 'Add an early bird' }));
    expect(latest.offers).toHaveLength(2);
    const early = latest.offers[1];
    expect(early.groupId).toBe('g1');
    expect(early.name).toBe('Standard early bird');
    expect(early.saleStartAt).toBe(performance.saleStartAt);
    expect(Date.parse(early.saleEndAt)).toBeLessThan(Date.parse(performance.saleEndAt));
    expect(latest.offers[0]).toEqual(standard);
    expect(screen.getByText(/cannot sell more than its capacity/)).toBeVisible();
  });

  it('shows the pool as fixed after release', () => {
    render(<Harness initial={{ version: 1, groups: [pool], offers: [standard] }} immutable />);
    expect(screen.getByText(/Stock pools are fixed once sales open/)).toBeVisible();
    expect(screen.getByLabelText(/^Capacity/)).toBeDisabled();
    expect(screen.queryByRole('button', { name: 'Add an early bird' })).toBeNull();
  });

  it('shows an error on the minimum field when it is above the per-account limit', () => {
    render(<Harness initial={{ version: 1, groups: [pool], offers: [standard] }} />);
    fireEvent.change(screen.getByLabelText(/^Minimum per order/), { target: { value: '6' } });
    expect(latest.offers[0].minPerOrder).toBe(6);
    expect(screen.getByText(/cannot be above the limit of 4 tickets per account/)).toBeVisible();
    expect(screen.getByLabelText(/^Minimum per order/)).toHaveAttribute('aria-invalid', 'true');
  });

  it('keeps a description of up to 500 characters with a counter', () => {
    render(<Harness initial={{ version: 1, groups: [pool], offers: [standard] }} />);
    fireEvent.change(screen.getByLabelText(/^Description for buyers/), {
      target: { value: 'Includes a poster' },
    });
    expect(latest.offers[0].description).toBe('Includes a poster');
    expect(screen.getByText('17 of 500 characters')).toBeVisible();
  });
});
