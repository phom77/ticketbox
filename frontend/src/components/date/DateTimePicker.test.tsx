import { useState } from 'react';
import { fireEvent, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { DateTimePicker } from './DateTimePicker';
import { MultiDatePicker } from './MultiDatePicker';
import { addDays, addMonths, monthGrid, parseTime, parseTypedDate, weekStart } from './dateMath';

function Harness({
  initial = '',
  min,
  max,
  zone,
}: {
  initial?: string;
  min?: string;
  max?: string;
  zone?: string;
}) {
  const [value, setValue] = useState(initial);
  return (
    <>
      <DateTimePicker
        name="start"
        label="Start"
        value={value}
        onChange={setValue}
        min={min}
        max={max}
        timeZone={zone}
      />
      <output data-testid="value">{value}</output>
    </>
  );
}

describe('date math', () => {
  it('moves by calendar months and clamps the day', () => {
    expect(addMonths('2027-01-31', 1)).toBe('2027-02-28');
    expect(addDays('2027-02-28', 1)).toBe('2027-03-01');
  });

  it('pads the month grid to whole weeks starting on the chosen weekday', () => {
    const grid = monthGrid('2027-02-10', 1);
    expect(grid.length % 7).toBe(0);
    expect(grid[0]).toBe('2027-02-01');
    expect(weekStart('vi')).toBe(1);
  });

  it('parses typed dates and times in the locale formats', () => {
    expect(parseTypedDate('05/03/2027', 'vi-VN')).toBe('2027-03-05');
    expect(parseTypedDate('03/05/2027', 'en-US')).toBe('2027-03-05');
    expect(parseTypedDate('31/02/2027', 'vi-VN')).toBe('');
    expect(parseTime('7:30 PM')).toBe('19:30');
    expect(parseTime('1930')).toBe('19:30');
    expect(parseTime('25:00')).toBe('');
  });
});

describe('DateTimePicker', () => {
  it('shows the labelled time zone next to the value', () => {
    render(<Harness initial="2027-03-05T19:30" zone="Asia/Ho_Chi_Minh" />);
    expect(screen.getByText(/Asia\/Ho Chi Minh/)).toBeInTheDocument();
    expect(screen.getByLabelText('Start, date')).toHaveValue('03/05/2027');
    expect(screen.getByLabelText('Start, time')).toHaveValue('7:30 PM');
  });

  it('chooses a day with the keyboard and returns focus to the field button', async () => {
    const user = userEvent.setup();
    render(<Harness initial="2027-03-05T19:30" />);
    const open = screen.getByRole('button', { name: 'Choose date for Start' });
    await user.click(open);
    const grid = screen.getByRole('grid');
    expect(grid.querySelector('button[tabindex="0"]')).toHaveFocus();
    await user.keyboard('{ArrowRight}{ArrowDown}');
    expect(grid.querySelector('button[tabindex="0"]')).toHaveAccessibleName(/March 13, 2027/);
    await user.keyboard('{PageDown}');
    expect(grid.querySelector('button[tabindex="0"]')).toHaveAccessibleName(/April 13, 2027/);
    await user.keyboard('{Enter}');
    expect(screen.getByTestId('value')).toHaveTextContent('2027-04-13T19:30');
    expect(screen.queryByRole('grid')).not.toBeInTheDocument();
    expect(open).toHaveFocus();
  });

  it('closes on Escape and keeps the value', async () => {
    const user = userEvent.setup();
    render(<Harness initial="2027-03-05T19:30" />);
    await user.click(screen.getByRole('button', { name: 'Choose date for Start' }));
    expect(screen.getByRole('grid').querySelector('button[tabindex="0"]')).toHaveFocus();
    await user.keyboard('{Escape}');
    expect(screen.queryByRole('grid')).not.toBeInTheDocument();
    expect(screen.getByTestId('value')).toHaveTextContent('2027-03-05T19:30');
  });

  it('closes on Escape from the month buttons and returns focus to the toggle', async () => {
    const user = userEvent.setup();
    render(<Harness initial="2027-03-05T19:30" />);
    const open = screen.getByRole('button', { name: 'Choose date for Start' });
    await user.click(open);
    screen.getByRole('button', { name: 'Next month' }).focus();
    await user.keyboard('{Escape}');
    expect(screen.queryByRole('grid')).not.toBeInTheDocument();
    expect(open).toHaveFocus();
  });

  it('keeps Tab focus inside the open calendar', async () => {
    const user = userEvent.setup();
    render(<Harness initial="2027-03-05T19:30" />);
    await user.click(screen.getByRole('button', { name: 'Choose date for Start' }));
    const dialog = screen.getByRole('dialog');
    for (let step = 0; step < 6; step += 1) {
      await user.tab();
      expect(dialog).toContainElement(document.activeElement as HTMLElement);
    }
    await user.tab({ shift: true });
    expect(dialog).toContainElement(document.activeElement as HTMLElement);
  });

  it('rejects a typed date outside min and max', async () => {
    const user = userEvent.setup();
    render(<Harness initial="2027-03-10T10:00" min="2027-03-08T00:00" max="2027-03-12T00:00" />);
    const field = screen.getByLabelText('Start, date');
    await user.clear(field);
    await user.type(field, '03/20/2027');
    expect(screen.getByText(/inside the allowed range/)).toBeInTheDocument();
    expect(screen.getByTestId('value')).toHaveTextContent('');
  });

  it('navigates the time list with arrows and links the active option', async () => {
    const user = userEvent.setup();
    render(<Harness initial="2027-03-05T00:00" />);
    const time = screen.getByLabelText('Start, time');
    await user.click(time);
    await user.keyboard('{ArrowDown}{ArrowDown}');
    const active = time.getAttribute('aria-activedescendant')!;
    expect(document.getElementById(active)).toHaveAccessibleName('12:15 AM');
    await user.keyboard('{Enter}');
    expect(screen.getByTestId('value')).toHaveTextContent('2027-03-05T00:15');
  });

  it('describes an invalid time on the time field', () => {
    render(<Harness />);
    fireEvent.change(screen.getByLabelText('Start, time'), { target: { value: '99:99' } });
    const time = screen.getByLabelText('Start, time');
    const describedBy = time.getAttribute('aria-describedby')!;
    expect(document.getElementById(describedBy)).toHaveTextContent(/valid time/);
  });

  it('disables days outside min and max', async () => {
    const user = userEvent.setup();
    render(<Harness initial="2027-03-10T10:00" min="2027-03-08T00:00" max="2027-03-12T00:00" />);
    await user.click(screen.getByRole('button', { name: 'Choose date for Start' }));
    const grid = screen.getByRole('grid');
    expect(within(grid).getByRole('button', { name: /March 7, 2027/ })).toHaveAttribute(
      'aria-disabled',
      'true',
    );
    expect(within(grid).getByRole('button', { name: /March 9, 2027/ })).not.toHaveAttribute(
      'aria-disabled',
    );
    expect(within(grid).getByRole('button', { name: /March 13, 2027/ })).toHaveAttribute(
      'aria-disabled',
      'true',
    );
  });

  it('accepts a typed date and a typed time and waits for both before reporting a value', async () => {
    const user = userEvent.setup();
    render(<Harness />);
    await user.type(screen.getByLabelText('Start, date'), '07/04/2027');
    expect(screen.getByTestId('value')).toHaveTextContent('');
    await user.type(screen.getByLabelText('Start, time'), '21:15');
    expect(screen.getByTestId('value')).toHaveTextContent('2027-07-04T21:15');
  });

  it('picks a time from the list of 15-minute steps', async () => {
    const user = userEvent.setup();
    render(<Harness initial="2027-03-05T00:00" />);
    await user.click(screen.getByLabelText('Start, time'));
    await user.click(screen.getByRole('option', { name: '6:45 PM' }));
    expect(screen.getByTestId('value')).toHaveTextContent('2027-03-05T18:45');
  });

  it('closes the time list when focus leaves the time field', async () => {
    const user = userEvent.setup();
    render(
      <>
        <Harness initial="2027-03-05T00:00" />
        <button type="button">Next control</button>
      </>,
    );
    await user.click(screen.getByLabelText('Start, time'));
    expect(screen.getByRole('listbox')).toBeInTheDocument();
    await user.keyboard('{Tab}');
    expect(screen.getByRole('button', { name: 'Next control' })).toHaveFocus();
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
  });

  it('explains a local time that a clock change skips', () => {
    render(<Harness initial="2027-03-14T02:30" zone="America/New_York" />);
    expect(screen.getByText(/skipped when clocks change/)).toBeInTheDocument();
  });

  it('flags a date that is not real', () => {
    render(<Harness />);
    fireEvent.change(screen.getByLabelText('Start, date'), { target: { value: '31/13/2027' } });
    expect(screen.getByText(/Enter a valid date/)).toBeInTheDocument();
  });
});

describe('MultiDatePicker', () => {
  it('toggles days, lists them and respects the limit', async () => {
    const user = userEvent.setup();
    const change = vi.fn();
    function Multi() {
      const [days, setDays] = useState<string[]>(['2027-03-05']);
      return (
        <MultiDatePicker
          label="Days"
          value={days}
          limit={2}
          onChange={(next) => {
            change(next);
            setDays(next);
          }}
        />
      );
    }
    render(<Multi />);
    await user.click(screen.getByRole('button', { name: /March 6, 2027/ }));
    expect(change).toHaveBeenLastCalledWith(['2027-03-05', '2027-03-06']);
    await user.click(screen.getByRole('button', { name: /March 7, 2027/ }));
    expect(change).toHaveBeenCalledTimes(1);
    expect(screen.getByRole('status')).toHaveTextContent('2 days chosen');
    await user.click(screen.getAllByRole('button', { name: /Remove/ })[0]);
    expect(change).toHaveBeenCalledTimes(2);
  });
});
