import { useEffect, useId, useRef, useState, type KeyboardEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import {
  addDays,
  addMonths,
  formatDay,
  monthGrid,
  toIsoDate,
  weekStart,
  weekdayOf,
} from './dateMath';

type CalendarGridProps = {
  /** The chosen days (ISO dates). A single-date picker passes one. */
  selected: string[];
  onSelect: (date: string) => void;
  /** Inclusive bounds; days outside them are disabled. */
  min?: string;
  max?: string;
  locale: string;
  /** The day that has focus first and the month shown; defaults to the first selected day or today. */
  initialDate?: string;
  /** Called when Escape is pressed inside the grid. */
  onEscape?: () => void;
  label?: string;
};

/** A WAI-ARIA date picker grid: arrows move by day or week, Page Up/Down by month, Home/End within the week. */
export function CalendarGrid({
  selected,
  onSelect,
  min,
  max,
  locale,
  initialDate,
  onEscape,
  label,
}: CalendarGridProps) {
  const { t } = useTranslation('scheduling');
  const today = toIsoDate(new Date());
  const [focused, setFocused] = useState(() => initialDate || selected[0] || today);
  const grid = useRef<HTMLTableElement>(null);
  const [moved, setMoved] = useState(false);
  const titleId = useId();
  const firstDay = weekStart(locale);
  const days = monthGrid(focused, firstDay);
  const weeks = Array.from({ length: days.length / 7 }, (_, index) =>
    days.slice(index * 7, index * 7 + 7),
  );
  const disabled = (day: string) => Boolean((min && day < min) || (max && day > max));

  useEffect(() => {
    if (moved) grid.current?.querySelector<HTMLButtonElement>('button[tabindex="0"]')?.focus();
  }, [focused, moved]);

  function move(next: string) {
    setMoved(true);
    setFocused(next);
  }

  function onKeyDown(event: KeyboardEvent) {
    const offset = (weekdayOf(focused) - firstDay + 7) % 7;
    const steps: Record<string, string> = {
      ArrowLeft: addDays(focused, -1),
      ArrowRight: addDays(focused, 1),
      ArrowUp: addDays(focused, -7),
      ArrowDown: addDays(focused, 7),
      Home: addDays(focused, -offset),
      End: addDays(focused, 6 - offset),
      PageUp: addMonths(focused, event.shiftKey ? -12 : -1),
      PageDown: addMonths(focused, event.shiftKey ? 12 : 1),
    };
    if (steps[event.key]) {
      event.preventDefault();
      move(steps[event.key]);
    } else if (event.key === 'Escape' && onEscape) {
      event.preventDefault();
      event.stopPropagation();
      onEscape();
    }
  }

  const weekdays = weeks[0].map((day) => formatDay(day, locale, { weekday: 'short' }));
  const fullWeekdays = weeks[0].map((day) => formatDay(day, locale, { weekday: 'long' }));
  return (
    <div className="calendar">
      <div className="calendar-header">
        <button
          type="button"
          className="calendar-nav"
          aria-label={t('scheduling:previousMonth')}
          onClick={() => move(addMonths(focused, -1))}
        >
          <ChevronLeft size={18} aria-hidden="true" />
        </button>
        <strong id={titleId} aria-live="polite">
          {formatDay(focused, locale, { month: 'long', year: 'numeric' })}
        </strong>
        <button
          type="button"
          className="calendar-nav"
          aria-label={t('scheduling:nextMonth')}
          onClick={() => move(addMonths(focused, 1))}
        >
          <ChevronRight size={18} aria-hidden="true" />
        </button>
      </div>
      <table
        className="calendar-grid"
        role="grid"
        aria-labelledby={titleId}
        aria-label={label}
        aria-multiselectable={selected.length > 1 ? true : undefined}
        ref={grid}
        onKeyDown={onKeyDown}
      >
        <thead>
          <tr>
            {weekdays.map((name, index) => (
              <th key={fullWeekdays[index]} scope="col" abbr={fullWeekdays[index]}>
                {name}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {weeks.map((week) => (
            <tr key={week[0]}>
              {week.map((day) => {
                const inMonth = day.slice(0, 7) === focused.slice(0, 7);
                const isDisabled = disabled(day);
                const isSelected = selected.includes(day);
                return (
                  <td
                    key={day}
                    role="gridcell"
                    aria-selected={isSelected}
                    className={inMonth ? undefined : 'calendar-outside'}
                  >
                    <button
                      type="button"
                      tabIndex={day === focused ? 0 : -1}
                      aria-disabled={isDisabled || undefined}
                      aria-current={day === today ? 'date' : undefined}
                      aria-label={formatDay(day, locale, { dateStyle: 'full' })}
                      className="calendar-day"
                      data-selected={isSelected || undefined}
                      onClick={() => {
                        if (isDisabled) return;
                        setFocused(day);
                        onSelect(day);
                      }}
                    >
                      {Number(day.slice(8))}
                    </button>
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
