import { useState } from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { MoneyInput } from './MoneyInput';

function Harness({ max }: { max?: number }) {
  const [value, setValue] = useState(0);
  return (
    <>
      <label>
        Price
        <MoneyInput value={value} onValueChange={setValue} max={max} />
      </label>
      <output>{value}</output>
    </>
  );
}

describe('MoneyInput', () => {
  it('shows zero when a free price is allowed', () => {
    render(<MoneyInput aria-label="Free" value={0} onValueChange={() => undefined} allowZero />);
    expect(screen.getByRole('textbox', { name: 'Free' })).toHaveValue('0');
  });

  it('groups digits and keeps the whole amount', () => {
    render(<Harness />);
    const input = screen.getByRole('textbox', { name: 'Price' });
    fireEvent.change(input, { target: { value: '1500000' } });
    expect(input).toHaveValue('1,500,000');
    expect(screen.getByRole('status')).toHaveTextContent('1500000');
  });

  it('ignores non-digits and amounts above the limit', () => {
    render(<Harness max={1000} />);
    const input = screen.getByRole('textbox', { name: 'Price' });
    fireEvent.change(input, { target: { value: '9a9' } });
    expect(input).toHaveValue('99');
    fireEvent.change(input, { target: { value: '99999' } });
    expect(input).toHaveValue('99');
    fireEvent.change(input, { target: { value: '' } });
    expect(input).toHaveValue('');
  });
});
