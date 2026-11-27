import { useState } from 'react';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { TimePicker } from './TimePicker';

function Harness({ initial = '' }: { initial?: string }) {
  const [value, setValue] = useState(initial);
  return (
    <>
      <TimePicker label="Start" value={value} onChange={setValue} />
      <output data-testid="value">{value}</output>
    </>
  );
}

describe('TimePicker', () => {
  it('keeps what is typed and reports 19:30 once it is complete', async () => {
    const user = userEvent.setup();
    render(<Harness />);
    const input = screen.getByLabelText('Start');
    await user.type(input, '19:30');
    expect(input).toHaveValue('19:30');
    expect(screen.getByTestId('value')).toHaveTextContent('19:30');
    await user.tab();
    expect(input).toHaveValue('7:30 PM');
  });

  it('does not rewrite a half-typed time on every keystroke', async () => {
    const user = userEvent.setup();
    render(<Harness />);
    const input = screen.getByLabelText('Start');
    await user.type(input, '19:3');
    expect(input).toHaveValue('19:3');
    expect(screen.getByTestId('value')).toHaveTextContent('');
  });

  it('shows an externally changed value', () => {
    const { rerender } = render(<TimePicker label="Start" value="08:00" onChange={() => {}} />);
    expect(screen.getByLabelText('Start')).toHaveValue('8:00 AM');
    rerender(<TimePicker label="Start" value="21:15" onChange={() => {}} />);
    expect(screen.getByLabelText('Start')).toHaveValue('9:15 PM');
  });
});
