import { fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { DiscoveryFilterPanel } from './DiscoveryFilterPanel';
import { readDiscoveryFilters } from './filters';

const noFilters = readDiscoveryFilters(new URLSearchParams(), false);

function renderPanel(isPreview = false) {
  const onApply = vi.fn();
  render(<DiscoveryFilterPanel filters={noFilters} isPreview={isPreview} onApply={onApply} />);
  return { onApply, user: userEvent.setup() };
}

describe('DiscoveryFilterPanel', () => {
  it('shows date fields only for a custom range and applies the chosen dates', async () => {
    const { onApply, user } = renderPanel();
    expect(screen.queryByLabelText(/From date/)).not.toBeInTheDocument();
    expect(screen.queryByRole('combobox', { name: /City/ })).not.toBeInTheDocument();

    await user.selectOptions(screen.getByRole('combobox', { name: /Event date/ }), 'custom');
    fireEvent.change(screen.getByLabelText(/From date/), { target: { value: '2026-12-01' } });
    fireEvent.change(screen.getByLabelText(/To date/), { target: { value: '2026-12-31' } });
    await user.selectOptions(screen.getByRole('combobox', { name: /Ticket sales/ }), 'on-sale');
    await user.click(screen.getByRole('button', { name: 'Apply filters' }));

    expect(onApply).toHaveBeenCalledWith({
      date: 'custom',
      from: '2026-12-01',
      to: '2026-12-31',
      status: 'on-sale',
    });
  });

  it('clears an empty custom range instead of applying it', async () => {
    const { onApply, user } = renderPanel();
    await user.selectOptions(screen.getByRole('combobox', { name: /Event date/ }), 'custom');
    await user.click(screen.getByRole('button', { name: 'Apply filters' }));

    expect(onApply).toHaveBeenCalledWith({ date: '', from: '', to: '', status: '' });
  });

  it('includes the sample city, category and price filters on the preview route', async () => {
    const { onApply, user } = renderPanel(true);
    await user.selectOptions(screen.getByRole('combobox', { name: /City/ }), 'hanoi');
    await user.click(screen.getByRole('button', { name: 'Apply filters' }));

    expect(onApply).toHaveBeenCalledWith(
      expect.objectContaining({ city: 'hanoi', category: '', price: '' }),
    );
  });
});
